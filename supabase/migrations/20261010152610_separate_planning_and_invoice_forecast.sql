-- Keep the operational cash forecast focused on the selected period. Historical
-- unpaid invoices remain visible in the cards area, but are not accumulated into
-- every following month.
create or replace function public.forecast_month(
  p_month date default null,
  p_currency text default 'BRL',
  p_include_overdue boolean default false
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  u uuid:=auth.uid();
  tz text;
  today date;
  month_start date;
  finish date;
  opening numeric;
  income numeric;
  expenses numeric;
  bills numeric;
  missing integer;
  oldest timestamptz;
  bank_missing integer;
begin
  if u is null then raise exception 'Autenticação necessária'; end if;
  select timezone into strict tz from public.users where id=u;
  today:=(now() at time zone tz)::date;
  month_start:=date_trunc('month',coalesce(p_month,today))::date;
  finish:=(month_start+interval '1 month - 1 day')::date;
  if finish<today then raise exception 'Previsão exige mês atual ou futuro'; end if;

  select coalesce(sum(current_balance),0),min(balance_as_of),count(*) filter(where balance_as_of is null)
  into opening,oldest,bank_missing
  from public.accounts
  where user_id=u and currency=p_currency and include_in_forecast and archived_at is null;

  select
    coalesce(sum(t.amount) filter(where t.direction='income'),0),
    coalesce(sum(t.amount) filter(where t.direction='expense'),0)
  into income,expenses
  from public.transactions t
  join public.accounts a on a.id=t.account_id and a.user_id=t.user_id
  where t.user_id=u and t.currency=p_currency
    and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name))
    and a.include_in_forecast and a.archived_at is null
    and (not t.needs_review or t.source<>'projection')
    and coalesce(t.due_date,(t.occurred_at at time zone tz)::date)<=finish
    and (
      (t.status='pending'
        and coalesce(t.due_date,(t.occurred_at at time zone tz)::date)>=
          case when p_include_overdue and month_start=date_trunc('month',today)::date then date '0001-01-01'
               else greatest(today,month_start) end
        and not exists(select 1 from public.invoice_payments p where p.transaction_id=t.id))
      or (t.status='posted' and a.balance_as_of is not null and coalesce(t.settled_at,t.occurred_at)>a.balance_as_of)
    );

  select coalesce(sum(i.remaining_due),0) into bills
  from public.invoices i
  join public.cards c on c.id=i.card_id
  left join public.accounts a on a.id=c.payment_account_id
  where i.user_id=u and i.currency=p_currency and c.archived_at is null
    and i.due_date>=month_start and i.due_date<month_start+interval '1 month'
    and (a.id is null or (a.include_in_forecast and a.archived_at is null));

  select count(*) into missing from public.transactions t
  where t.user_id=u and t.status<>'cancelled'
    and (t.needs_review or (t.card_id is not null and t.invoice_id is null and t.kind<>'invoice_payment'));

  return jsonb_build_object(
    'current_balance',opening::text,
    'pending_income',income::text,
    'pending_expenses',expenses::text,
    'invoices_due',bills::text,
    'projected_balance',(opening+income-expenses-bills)::text,
    'currency',p_currency,
    'through',finish,
    'as_of',oldest,
    'review_count',missing,
    'missing_balance_count',bank_missing,
    'includes_overdue',p_include_overdue
  );
end; $$;

-- Monthly planning is a scenario layer. Real movements are read-only inputs;
-- changing a budget never creates or mutates a transaction.
create or replace function public.monthly_overview(p_month date,p_currency text default 'BRL') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
  u uuid:=auth.uid();
  tz text;
  result jsonb;
begin
  if u is null then raise exception 'Autenticação necessária'; end if;
  if p_month is null or extract(day from p_month)<>1 or p_currency<>'BRL' then
    raise exception 'Informe o primeiro dia do mês e a moeda BRL';
  end if;
  select timezone into strict tz from public.users where id=u;

  with actual as (
    select t.category_id,t.direction,sum(t.amount) amount
    from public.transactions t
    where t.user_id=u and t.currency=p_currency and t.status='posted'
      and t.source<>'projection' and t.kind='regular'
      and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name))
      and not exists(select 1 from public.invoice_payments p where p.user_id=u and p.transaction_id=t.id)
      and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone tz)::date end)>=p_month
      and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone tz)::date end)<(p_month+interval '1 month')::date
    group by t.category_id,t.direction
  ), planned as (
    select category_id,direction,amount
    from public.monthly_budgets
    where user_id=u and month=p_month
  ), keys as (
    select c.id category_id,d.direction
    from public.categories c cross join (values('income'),('expense')) d(direction)
    where c.user_id=u and c.archived_at is null and (c.kind=d.direction or c.kind='both')
    union select category_id,direction from actual
    union select category_id,direction from planned
  ), lines as (
    select k.category_id,k.direction,coalesce(c.name,'Sem categoria') name,
      c.archived_at is not null archived,
      case when k.direction='expense' then c.expense_group end expense_group,
      coalesce(c.sort_order,2147483647) sort_order,
      coalesce(b.amount,0) estimated,
      coalesce(a.amount,0) actual
    from keys k
    left join public.categories c on c.id=k.category_id and c.user_id=u
    left join planned b on b.category_id=k.category_id and b.direction=k.direction
    left join actual a on a.category_id is not distinct from k.category_id and a.direction=k.direction
  ), totals as (
    select
      coalesce(sum(estimated) filter(where direction='income'),0) estimated_income,
      coalesce(sum(estimated) filter(where direction='expense'),0) estimated_expense,
      coalesce(sum(actual) filter(where direction='income'),0) actual_income,
      coalesce(sum(actual) filter(where direction='expense'),0) actual_expense,
      coalesce(sum(greatest(estimated-actual,0)) filter(where direction='income'),0) remaining_income,
      coalesce(sum(greatest(estimated-actual,0)) filter(where direction='expense'),0) remaining_expense
    from lines
  ), cash as (
    select
      coalesce((select sum(a.current_balance) from public.accounts a
        where a.user_id=u and a.currency=p_currency and a.include_in_forecast and a.archived_at is null),0) current_balance,
      coalesce((select sum(i.remaining_due) from public.invoices i join public.cards c on c.id=i.card_id
        left join public.accounts a on a.id=c.payment_account_id
        where i.user_id=u and i.currency=p_currency and c.archived_at is null
          and i.due_date>=p_month and i.due_date<p_month+interval '1 month'
          and (a.id is null or (a.include_in_forecast and a.archived_at is null))),0) invoice_due
  )
  select jsonb_build_object(
    'month',p_month,
    'currency',p_currency,
    'estimated_income',estimated_income::text,
    'estimated_expense',estimated_expense::text,
    'actual_income',actual_income::text,
    'actual_expense',actual_expense::text,
    'estimated_result',(estimated_income-estimated_expense)::text,
    'actual_result',(actual_income-actual_expense)::text,
    'remaining_income',remaining_income::text,
    'remaining_expense',remaining_expense::text,
    'current_balance',current_balance::text,
    'invoice_due',invoice_due::text,
    'projected_cash_balance',(current_balance+remaining_income-remaining_expense-invoice_due)::text,
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'category_id',category_id,
      'name',name,
      'direction',direction,
      'expense_group',expense_group,
      'archived',archived,
      'estimated',estimated::text,
      'actual',actual::text,
      'difference',(case when direction='income' then actual-estimated else estimated-actual end)::text
    ) order by sort_order,name,direction) from lines),'[]'::jsonb)
  ) into result
  from totals cross join cash;
  return result;
end; $$;

revoke all on function public.forecast_month(date,text,boolean),public.monthly_overview(date,text) from public,anon;
grant execute on function public.forecast_month(date,text,boolean),public.monthly_overview(date,text) to authenticated;
