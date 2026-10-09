begin;
alter table public.transactions add column original_currency text check(original_currency ~ '^[A-Z]{3}$');
alter table public.transactions add column original_amount numeric(20,2) check(original_amount>=0);
alter table public.transactions add constraint transactions_original_currency_pair check((original_currency is null)=(original_amount is null));
create or replace function public.auro_ingest(p_connection uuid,p_rows jsonb) returns integer
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
       if nullif(r->>'bill_forecast_month','') is not null then
         mon:=(r->>'bill_forecast_month')::date;
         if extract(day from mon)<>1 then raise exception 'Mês previsto inválido'; end if;
         -- A month never means the first day is the due date. Prefer a known bill.
         select id,due_date,closing_date into inv,due,close from public.invoices
          where user_id=u and card_id=c.id and reference_month=mon;
         if inv is null and c.due_day is not null then
           due:=public.auro_month_day(mon,c.due_day);
           if c.closing_day is not null then
             close:=public.auro_month_day(mon,c.closing_day);
             if close>=due then close:=public.auro_month_day((mon-interval '1 month')::date,c.closing_day); end if;
           end if;
         end if;
       elsif nullif(r->>'bill_forecast_date','') is not null then
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
     billing_month,defer_to_next_month,provider_updated_at,needs_review,purchase_date,original_currency,original_amount)
   values(row_id,u,a.id,c.id,inv,p_connection,r->>'pluggy_transaction_id',(r->>'occurred_at')::timestamptz,
     coalesce(due,(r->>'occurred_at')::date),r->>'description',r->>'merchant_name',merchant,amount,r->>'direction',r->>'currency',
     r->>'status','pluggy',r->>'provider_status',r->>'payment_method',r->>'kind',cat,cat_source,plan,n,total,mon,deferred,
     (r->>'provider_updated_at')::timestamptz,is_review,purchase,r->>'original_currency',(r->>'original_amount')::numeric)
   on conflict(id) do update set invoice_id=excluded.invoice_id,pluggy_transaction_id=excluded.pluggy_transaction_id,
     connection_id=excluded.connection_id,occurred_at=excluded.occurred_at,due_date=excluded.due_date,
     description=excluded.description,merchant_name=excluded.merchant_name,merchant_key=excluded.merchant_key,
     amount=excluded.amount,direction=excluded.direction,status=excluded.status,source='pluggy',provider_status=excluded.provider_status,
     payment_method=excluded.payment_method,kind=excluded.kind,category_id=excluded.category_id,category_source=excluded.category_source,
     installment_plan_id=excluded.installment_plan_id,installment_number=excluded.installment_number,total_installments=excluded.total_installments,
     billing_month=excluded.billing_month,defer_to_next_month=excluded.defer_to_next_month,provider_updated_at=excluded.provider_updated_at,
     needs_review=excluded.needs_review,purchase_date=excluded.purchase_date,original_currency=excluded.original_currency,original_amount=excluded.original_amount;
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


commit;
