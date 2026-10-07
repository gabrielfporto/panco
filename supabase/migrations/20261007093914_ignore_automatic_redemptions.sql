-- Retain bank snapshots and raw history; exclude automatic redemption entries from reporting.
create or replace function public.panco_ignored_transaction(p_description text,p_merchant text default null)
returns boolean language sql immutable security invoker set search_path='' as $$
 select position('RES APLIC AUT MAIS' in upper(regexp_replace(coalesce(p_description,''),'[[:space:]]+',' ','g')))>0
 or position('RES APLIC AUT MAIS' in upper(regexp_replace(coalesce(p_merchant,''),'[[:space:]]+',' ','g')))>0;
$$;
revoke all on function public.panco_ignored_transaction(text,text) from public,anon;
grant execute on function public.panco_ignored_transaction(text,text) to authenticated,service_role;

create or replace function public.forecast_month(p_month date default null,p_currency text default 'BRL',p_include_overdue boolean default true)
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
 where t.user_id=u and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name)) and t.currency=p_currency and a.include_in_forecast and a.archived_at is null and (not t.needs_review or t.source<>'projection')
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
 select count(*) into missing from public.transactions t where t.user_id=u and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name)) and t.status<>'cancelled'
 and (t.needs_review or (t.card_id is not null and t.invoice_id is null and t.kind<>'invoice_payment'));
 return jsonb_build_object('current_balance',opening::text,'pending_income',income::text,'pending_expenses',expenses::text,
   'invoices_due',bills::text,'projected_balance',(opening+income-expenses-bills)::text,'currency',p_currency,
   'through',finish,'as_of',oldest,'review_count',missing,'missing_balance_count',bank_missing,'includes_overdue',p_include_overdue);
end; $$;

create or replace function public.spending_summary(p_from date,p_to date,p_merchant text default '',p_currency text default 'BRL')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or p_to<p_from or p_to-p_from>366 then raise exception 'Intervalo inválido'; end if;
 select jsonb_build_object('type','spending_summary','title',case when p_merchant='' then 'Despesas no período' else 'Despesas: '||p_merchant end,
   'amount',coalesce(sum(t.amount),0)::text,'count',count(*),'from',p_from,'to',p_to,'currency',p_currency) into result
 from public.transactions t join public.users u on u.id=t.user_id
 where t.user_id=auth.uid() and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name)) and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone u.timezone)::date end) between p_from and p_to
 and t.direction='expense' and t.status<>'cancelled' and t.source<>'projection' and t.kind='regular'
 and t.currency=p_currency and (p_merchant='' or position(lower(p_merchant) in lower(coalesce(t.merchant_name,t.description)))>0);
 return result;
end; $$;

