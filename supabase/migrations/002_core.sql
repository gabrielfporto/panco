begin;
alter table public.transactions add column needs_review boolean not null default false;
alter table public.transactions add column purchase_date date;
alter table public.invoices alter column closing_date drop not null;
alter table public.invoices add column provider_paid numeric(20,2) not null default 0 check(provider_paid >= 0);
alter table public.sync_checkpoints add column lease_token uuid;
alter table public.webhook_events add column payload jsonb not null default '{}'::jsonb;

create function public.auro_month_day(p_month date, p_day integer) returns date
language sql immutable set search_path='' as $$
 select (date_trunc('month',p_month)::date + (least(p_day,extract(day from date_trunc('month',p_month) + interval '1 month - 1 day')::integer)-1));
$$;

create function public.auro_cycle(p_date date,p_close integer,p_due integer,p_force boolean default false)
returns table(closing_date date,due_date date,billing_month date,deferred boolean)
language plpgsql immutable set search_path='' as $$
begin
 if p_close not between 1 and 31 or p_due not between 1 and 31 or p_close is null or p_due is null then return; end if;
 closing_date := public.auro_month_day(p_date,p_close);
 deferred := p_force or p_date > closing_date;
 if deferred then closing_date := public.auro_month_day((date_trunc('month',p_date)+interval '1 month')::date,p_close); end if;
 due_date := public.auro_month_day(closing_date,p_due);
 if due_date <= closing_date then due_date := public.auro_month_day((date_trunc('month',closing_date)+interval '1 month')::date,p_due); end if;
 billing_month := date_trunc('month',due_date)::date;
 return next;
end; $$;

create function public.auro_rebuild_invoices(p_user uuid) returns void
language sql set search_path='' as $$
 update public.invoices i set estimated_total=coalesce((
   select sum(case t.direction when 'expense' then t.amount else -t.amount end)
   from public.transactions t where t.invoice_id=i.id and t.user_id=p_user
     and t.status <> 'cancelled' and (not t.needs_review or t.source<>'projection') and t.kind <> 'invoice_payment'),0),
 total_paid=greatest(i.provider_paid,coalesce((select sum(p.amount) from public.invoice_payments p
   join public.transactions t on t.id=p.transaction_id and t.user_id=p.user_id
   where p.invoice_id=i.id and p.user_id=p_user and t.status='posted'),0))
 where i.user_id=p_user;
$$;

-- A ingestão e avanço de cursor acontecem no mesmo commit PostgreSQL.
create function public.auro_ingest(p_connection uuid,p_rows jsonb) returns integer
language plpgsql set search_path='' as $$
<<ingest>>
declare
 u uuid; r jsonb; a public.accounts; c public.cards; old public.transactions; row_id uuid;
 cat uuid; cat_source text; inv uuid; cyc record; plan uuid; candidates uuid[];
 n integer; total integer; k integer; due date; close date; mon date; deferred boolean;
 amount numeric; merchant text; purchase date; is_review boolean; processed integer:=0;
begin
 select user_id into strict u from public.open_finance_connections where id=p_connection and status <> 'revoked';
 perform pg_advisory_xact_lock(hashtextextended(p_connection::text,0));
 if jsonb_array_length(p_rows)>500 then raise exception 'Página excede 500'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
   a:=null; c:=null; old:=null; inv:=null; plan:=null; cat:=null; deferred:=false; is_review:=false;
   due:=null; close:=null; mon:=null;
   select * into a from public.accounts where connection_id=p_connection and pluggy_account_id=r->>'external_account_id' and user_id=u;
   select * into c from public.cards where connection_id=p_connection and pluggy_account_id=r->>'external_account_id' and user_id=u;
   if num_nonnulls(a.id,c.id)<>1 then raise exception 'Conta Pluggy não mapeada'; end if;
   select * into old from public.transactions where connection_id=p_connection and pluggy_transaction_id=r->>'pluggy_transaction_id';
   if old.provider_updated_at is not null and (r->>'provider_updated_at')::timestamptz < old.provider_updated_at then continue; end if;
   n:=(r->>'installment_number')::integer; total:=(r->>'total_installments')::integer;
   amount:=(r->>'amount')::numeric; merchant:=r->>'merchant_key'; purchase:=(r->>'purchase_date')::date;
   cat_source:='uncategorized';
   if old.category_source='manual' then cat:=old.category_id; cat_source:='manual';
   else
     select cr.category_id into cat from public.category_rules cr where cr.user_id=u and cr.merchant_key=merchant and cr.enabled;
     if cat is not null then cat_source:='rule'; end if;
   end if;
   if c.id is not null and r->>'kind'<>'invoice_payment' then
     select id,due_date,closing_date,reference_month into inv,due,close,mon from public.invoices
       where card_id=c.id and pluggy_bill_id=r->>'pluggy_bill_id' and user_id=u;
     if inv is null then
       if nullif(r->>'bill_forecast_date','') is not null then
         due:=(r->>'bill_forecast_date')::date; close:=(r->>'bill_closing_date')::date; mon:=date_trunc('month',due)::date;
       else
         select * into cyc from public.auro_cycle((r->>'occurred_at')::date,c.closing_day,c.due_day);
         due:=cyc.due_date; close:=cyc.closing_date; mon:=cyc.billing_month; deferred:=coalesce(cyc.deferred,false);
       end if;
       if due is not null then
         insert into public.invoices(user_id,card_id,reference_month,closing_date,due_date,status,currency)
         values(u,c.id,mon,close,due,case when close < current_date then 'CLOSED' when close >= (current_date+interval '1 month')::date then 'FUTURE' else 'OPEN' end,c.currency)
         on conflict(card_id,reference_month) do nothing;
         select id into inv from public.invoices where card_id=c.id and reference_month=mon;
       else is_review:=true; end if;
     end if;
     if total>1 and n is not null and r->>'direction'='expense' then
       plan:=old.installment_plan_id;
       if plan is null then
         select array_agg(distinct p.id) into candidates from public.installment_plans p
         join public.transactions t on t.installment_plan_id=p.id
         where p.user_id=u and p.card_id=c.id and p.total_installments=total and t.amount=ingest.amount
           and t.merchant_key=merchant and p.match_status<>'ambiguous'
           and not exists(select 1 from public.transactions x where x.installment_plan_id=p.id and x.installment_number=n and x.source<>'projection');
         if cardinality(candidates)=1 and purchase is not null and exists(select 1 from public.installment_plans where id=candidates[1] and purchase_date=purchase) then
           plan:=candidates[1];
           update public.installment_plans set match_status='confirmed' where id=plan;
         elsif cardinality(candidates)>0 then
           -- Sem prova suficiente, preservar lançamentos reais e excluir estimativas ambíguas da previsão.
           update public.installment_plans set match_status='ambiguous' where id=any(candidates);
           update public.transactions set needs_review=true where installment_plan_id=any(candidates) and source='projection';
           is_review:=true;
         end if;
         if plan is null then
           insert into public.installment_plans(user_id,card_id,merchant_name,purchase_date,total_installments,match_status)
           values(u,c.id,r->>'merchant_name',purchase,total,case when is_review then 'ambiguous' else 'unverified' end) returning id into plan;
         end if;
       end if;
     end if;
   end if;
   -- Possível cobrança de assinatura: manter o fato bancário e retirar só a estimativa
   -- até o usuário confirmar a correspondência, sem somar os dois.
   update public.transactions t set needs_review=true where t.user_id=u and t.source='projection'
     and t.subscription_id is not null and t.status='pending' and t.merchant_key=merchant
     and t.amount=ingest.amount and t.account_id is not distinct from a.id and t.card_id is not distinct from c.id
     and abs(t.occurred_at::date-(r->>'occurred_at')::date)<=3;
   row_id:=old.id;
   if row_id is null and plan is not null then
     select id into row_id from public.transactions where installment_plan_id=plan and installment_number=n and source='projection';
   end if;
   row_id:=coalesce(row_id,gen_random_uuid());
   insert into public.transactions(id,user_id,account_id,card_id,invoice_id,connection_id,pluggy_transaction_id,
     occurred_at,due_date,description,merchant_name,merchant_key,amount,direction,currency,status,source,
     provider_status,payment_method,kind,category_id,category_source,installment_plan_id,installment_number,total_installments,
     billing_month,defer_to_next_month,provider_updated_at,needs_review,purchase_date)
   values(row_id,u,a.id,c.id,inv,p_connection,r->>'pluggy_transaction_id',(r->>'occurred_at')::timestamptz,
     coalesce(due,(r->>'occurred_at')::date),r->>'description',r->>'merchant_name',merchant,amount,r->>'direction',r->>'currency',
     r->>'status','pluggy',r->>'provider_status',r->>'payment_method',r->>'kind',cat,cat_source,plan,n,total,mon,deferred,
     (r->>'provider_updated_at')::timestamptz,is_review,purchase)
   on conflict(id) do update set invoice_id=excluded.invoice_id,pluggy_transaction_id=excluded.pluggy_transaction_id,
     connection_id=excluded.connection_id,occurred_at=excluded.occurred_at,due_date=excluded.due_date,
     description=excluded.description,merchant_name=excluded.merchant_name,merchant_key=excluded.merchant_key,
     amount=excluded.amount,direction=excluded.direction,status=excluded.status,source='pluggy',provider_status=excluded.provider_status,
     payment_method=excluded.payment_method,kind=excluded.kind,category_id=excluded.category_id,category_source=excluded.category_source,
     installment_plan_id=excluded.installment_plan_id,installment_number=excluded.installment_number,total_installments=excluded.total_installments,
     billing_month=excluded.billing_month,defer_to_next_month=excluded.defer_to_next_month,provider_updated_at=excluded.provider_updated_at,
     needs_review=excluded.needs_review,purchase_date=excluded.purchase_date;
   if plan is not null and due is not null then
     for k in (n+1)..total loop
       mon:=date_trunc('month',due+make_interval(months=>k-n))::date;
       insert into public.invoices(user_id,card_id,reference_month,closing_date,due_date,status,currency)
       values(u,c.id,mon,case when close is null then null else (close+make_interval(months=>k-n))::date end,
         (due+make_interval(months=>k-n))::date,'FUTURE',c.currency)
       on conflict(card_id,reference_month) do nothing;
       select id into inv from public.invoices where card_id=c.id and reference_month=mon;
       insert into public.transactions(user_id,card_id,invoice_id,occurred_at,due_date,description,merchant_name,merchant_key,
         amount,direction,currency,status,source,category_id,category_source,installment_plan_id,installment_number,total_installments,
         billing_month,projection_key,needs_review,purchase_date)
       values(u,c.id,inv,(r->>'occurred_at')::timestamptz+make_interval(months=>k-n),(due+make_interval(months=>k-n))::date,
         r->>'description',r->>'merchant_name',merchant,amount,'expense',c.currency,'pending','projection',cat,cat_source,plan,k,total,mon,
         'installment:'||plan||':'||k,is_review,purchase)
       on conflict(installment_plan_id,installment_number) do update set amount=excluded.amount,category_id=excluded.category_id,
         invoice_id=excluded.invoice_id,due_date=excluded.due_date,billing_month=excluded.billing_month,needs_review=excluded.needs_review
         where public.transactions.source='projection' and public.transactions.category_source<>'manual';
     end loop;
   end if;
   processed:=processed+1;
 end loop;
 perform public.auro_rebuild_invoices(u);
 return processed;
end; $$;

create function public.auro_claim_sync(p_connection uuid,p_resource text,p_query jsonb default '{}'::jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare u uuid; s public.sync_checkpoints; token uuid:=gen_random_uuid();
begin
 select user_id into strict u from public.open_finance_connections where id=p_connection and status<>'revoked';
 insert into public.sync_checkpoints(user_id,connection_id,resource_key,query_parameters) values(u,p_connection,p_resource,p_query)
 on conflict(connection_id,resource_key) do nothing;
 select * into s from public.sync_checkpoints where connection_id=p_connection and resource_key=p_resource for update;
 if s.lease_until>now() then return jsonb_build_object('busy',true); end if;
 if s.status='complete' or s.query_parameters<>p_query then s.next_cursor:=null; end if;
 update public.sync_checkpoints set status='running',lease_token=token,lease_until=now()+interval '90 seconds',
   next_cursor=s.next_cursor,query_parameters=p_query where id=s.id;
 return jsonb_build_object('id',s.id,'token',token,'next',s.next_cursor,'busy',false);
end; $$;

create function public.auro_commit_page(p_checkpoint uuid,p_token uuid,p_rows jsonb,p_next text)
returns integer language plpgsql set search_path='' as $$
declare s public.sync_checkpoints; n integer;
begin
 select * into strict s from public.sync_checkpoints where id=p_checkpoint for update;
 if s.lease_token is distinct from p_token or s.lease_until<now() then raise exception 'Lease expirado'; end if;
 n:=public.auro_ingest(s.connection_id,p_rows);
 update public.sync_checkpoints set next_cursor=p_next,status=case when p_next is null then 'complete' else 'running' end,
   lease_until=case when p_next is null then null else now()+interval '90 seconds' end,
   last_success_at=now() where id=s.id;
 return n;
end; $$;

create function public.auro_delete_transactions(p_connection uuid,p_ids text[]) returns void
language plpgsql set search_path='' as $$
declare u uuid;
begin
 select user_id into strict u from public.open_finance_connections where id=p_connection;
 perform pg_advisory_xact_lock(hashtextextended(p_connection::text,0));
 update public.transactions set needs_review=true where source='projection' and installment_plan_id in (
   select installment_plan_id from public.transactions where connection_id=p_connection and pluggy_transaction_id=any(p_ids));
 update public.transactions set status='cancelled' where connection_id=p_connection and pluggy_transaction_id=any(p_ids);
 perform public.auro_rebuild_invoices(u);
end; $$;

create function public.auro_validate_payment() returns trigger language plpgsql set search_path='' as $$
declare t public.transactions; i public.invoices;
begin
 select * into strict t from public.transactions where id=new.transaction_id and user_id=new.user_id for update;
 select * into strict i from public.invoices where id=new.invoice_id and user_id=new.user_id;
 if t.account_id is null or t.direction<>'expense' or t.currency<>i.currency or t.status='cancelled' then raise exception 'Pagamento inválido'; end if;
 if new.amount+coalesce((select sum(amount) from public.invoice_payments where transaction_id=t.id and id<>new.id),0)>t.amount then raise exception 'Alocação excede pagamento'; end if;
 return new;
end; $$;
create trigger validate_payment before insert or update on public.invoice_payments for each row execute function public.auro_validate_payment();

create function public.auro_refresh_after_change() returns trigger language plpgsql set search_path='' as $$
begin
 perform public.auro_rebuild_invoices(case when tg_op='DELETE' then old.user_id else new.user_id end);
 return null;
end; $$;
create trigger refresh_invoice_payments after insert or update or delete on public.invoice_payments for each row execute function public.auro_refresh_after_change();
create trigger refresh_invoice_transactions after insert or update or delete on public.transactions for each row execute function public.auro_refresh_after_change();

-- Previsão a partir do snapshot atual; não reconstrói saldos históricos.
create function public.forecast_month(p_month date default null,p_currency text default 'BRL',p_include_overdue boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); tz text; today date; finish date; opening numeric; income numeric; expenses numeric; bills numeric;
 missing integer; oldest timestamptz; bank_missing integer;
begin
 if u is null then raise exception 'Autenticação necessária'; end if;
 select timezone into strict tz from public.users where id=u;
 today:=(now() at time zone tz)::date; finish:=(date_trunc('month',coalesce(p_month,today))+interval '1 month - 1 day')::date;
 if finish<today then raise exception 'Previsão exige mês atual ou futuro'; end if;
 select coalesce(sum(current_balance),0),min(balance_as_of),count(*) filter(where balance_as_of is null)
 into opening,oldest,bank_missing from public.accounts
 where user_id=u and currency=p_currency and include_in_forecast and archived_at is null;
 select coalesce(sum(t.amount) filter(where t.direction='income'),0),coalesce(sum(t.amount) filter(where t.direction='expense'),0)
 into income,expenses from public.transactions t join public.accounts a on a.id=t.account_id and a.user_id=t.user_id
 where t.user_id=u and t.currency=p_currency and a.include_in_forecast and a.archived_at is null and (not t.needs_review or t.source<>'projection')
 and coalesce(t.due_date,(t.occurred_at at time zone tz)::date)<=finish
 and (
   (t.status='pending' and (p_include_overdue or coalesce(t.due_date,(t.occurred_at at time zone tz)::date)>=today)
     and not exists(select 1 from public.invoice_payments p where p.transaction_id=t.id))
   or (t.status='posted' and a.balance_as_of is not null and coalesce(t.settled_at,t.occurred_at)>a.balance_as_of)
 );
 select coalesce(sum(i.remaining_due),0) into bills from public.invoices i join public.cards c on c.id=i.card_id
 left join public.accounts a on a.id=c.payment_account_id
 where i.user_id=u and i.currency=p_currency and c.archived_at is null and i.due_date<=finish
 and (p_include_overdue or i.due_date>=today) and (a.id is null or (a.include_in_forecast and a.archived_at is null));
 select count(*) into missing from public.transactions t where t.user_id=u and t.status<>'cancelled'
 and (t.needs_review or (t.card_id is not null and t.invoice_id is null and t.kind<>'invoice_payment'));
 return jsonb_build_object('current_balance',opening::text,'pending_income',income::text,'pending_expenses',expenses::text,
   'invoices_due',bills::text,'projected_balance',(opening+income-expenses-bills)::text,'currency',p_currency,
   'through',finish,'as_of',oldest,'review_count',missing,'missing_balance_count',bank_missing,'includes_overdue',p_include_overdue);
end; $$;

create function public.spending_summary(p_from date,p_to date,p_merchant text default '',p_currency text default 'BRL')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or p_to<p_from or p_to-p_from>366 then raise exception 'Intervalo inválido'; end if;
 select jsonb_build_object('type','spending_summary','title',case when p_merchant='' then 'Despesas no período' else 'Despesas: '||p_merchant end,
   'amount',coalesce(sum(t.amount),0)::text,'count',count(*),'from',p_from,'to',p_to,'currency',p_currency) into result
 from public.transactions t join public.users u on u.id=t.user_id
 where t.user_id=auth.uid() and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone u.timezone)::date end) between p_from and p_to
 and t.direction='expense' and t.status<>'cancelled' and t.source<>'projection' and t.kind='regular'
 and t.currency=p_currency and (p_merchant='' or position(lower(p_merchant) in lower(coalesce(t.merchant_name,t.description)))>0);
 return result;
end; $$;

-- Funções internas nunca são chamadas diretamente pelo navegador.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'auro_%' or p.proname in ('forecast_month','spending_summary')) loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
grant execute on function public.auro_rebuild_invoices(uuid) to authenticated;
grant execute on function public.forecast_month(date,text,boolean) to authenticated;
grant execute on function public.spending_summary(date,date,text,text) to authenticated;
commit;
