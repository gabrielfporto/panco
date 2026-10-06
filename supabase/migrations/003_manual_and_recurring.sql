begin;
create function public.create_manual_transaction(p_data jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); c public.cards; a public.accounts; inv uuid; result uuid; cycle record;
 dt date:=(p_data->>'date')::date; category uuid:=(p_data->>'category_id')::uuid; plan uuid;
 n integer:=coalesce((p_data->>'installment_number')::integer,1); total integer:=coalesce((p_data->>'total_installments')::integer,1);
 k integer; d date; month date; currency text; merchant text:=lower(trim(regexp_replace(p_data->>'description','\s+',' ','g')));
begin
 select null::date as due_date,null::date as closing_date,null::date as billing_month,false as deferred into cycle;
 if u is null then raise exception 'Autenticação necessária'; end if;
 if num_nonnulls(nullif(p_data->>'account_id',''),nullif(p_data->>'card_id',''))<>1 then raise exception 'Selecione conta ou cartão'; end if;
 if dt is null or total<1 or total>120 or n<1 or n>total or length(trim(p_data->>'description'))=0 then raise exception 'Dados inválidos'; end if;
 if nullif(p_data->>'card_id','') is not null then
  select * into strict c from public.cards where id=(p_data->>'card_id')::uuid and user_id=u;
  if c.closing_day is null or c.due_day is null then raise exception 'Configure fechamento e vencimento do cartão'; end if;
  currency:=c.currency;
 else select * into strict a from public.accounts where id=(p_data->>'account_id')::uuid and user_id=u; currency:=a.currency;
  if total>1 then raise exception 'Parcelamento requer cartão'; end if;
 end if;
 if total>1 then
  insert into public.installment_plans(user_id,card_id,merchant_name,purchase_date,total_installments,match_status)
  values(u,c.id,p_data->>'description',dt,total,'confirmed') returning id into plan;
 end if;
 for k in n..total loop
  d:=(dt+make_interval(months=>k-n))::date; inv:=null; month:=null;
  if c.id is not null then
   select * into cycle from public.auro_cycle(d,c.closing_day,c.due_day,coalesce((p_data->>'defer_to_next_month')::boolean,false));
   month:=cycle.billing_month;
   insert into public.invoices(user_id,card_id,reference_month,closing_date,due_date,status,currency)
   values(u,c.id,month,cycle.closing_date,cycle.due_date,'OPEN',currency) on conflict(card_id,reference_month) do nothing;
   select id into inv from public.invoices where card_id=c.id and reference_month=month;
  end if;
  insert into public.transactions(user_id,account_id,card_id,invoice_id,category_id,occurred_at,due_date,description,merchant_name,merchant_key,
   amount,direction,currency,status,source,category_source,installment_plan_id,installment_number,total_installments,billing_month,defer_to_next_month,projection_key)
  values(u,a.id,c.id,inv,category, (d::timestamp+interval '12 hours') at time zone (select timezone from public.users where id=u),
   case when c.id is not null then cycle.due_date else d end,p_data->>'description',p_data->>'description',merchant,
   (p_data->>'amount')::numeric,p_data->>'direction',currency,case when k>n then 'pending' else coalesce(p_data->>'status','pending') end,
   case when k>n then 'projection' else 'manual' end,case when category is null then 'uncategorized' else 'manual' end,plan,
   case when total>1 then k else null end,case when total>1 then total else null end,month,
   case when c.id is not null then cycle.deferred else false end,case when k>n then 'installment:'||plan||':'||k else null end)
  returning id into result;
 end loop;
 return result;
end; $$;

-- Gera ocorrências até a data solicitada; não soma assinaturas diretamente ao forecast.
create function public.schedule_subscriptions(p_until date) returns integer
language plpgsql security invoker set search_path='' as $$
declare s public.subscriptions; d date; anchor date; idx integer; cycle record; inv uuid; n integer:=0; u uuid:=auth.uid(); card public.cards;
begin
 select null::date as due_date,null::date as closing_date,null::date as billing_month,false as deferred into cycle;
 if u is null or p_until>current_date+interval '1 year' then raise exception 'Horizonte inválido'; end if;
 for s in select * from public.subscriptions where user_id=u and status='active' for update loop
  d:=s.next_due_date; anchor:=d; idx:=0;
  while d<=p_until loop
   inv:=null;
   if s.card_id is not null then
    select * into strict card from public.cards where id=s.card_id and user_id=u;
    if card.closing_day is null or card.due_day is null then raise exception 'Configure os dias do cartão'; end if;
    select * into cycle from public.auro_cycle(d,card.closing_day,card.due_day);
    insert into public.invoices(user_id,card_id,reference_month,closing_date,due_date,status,currency)
    values(u,card.id,cycle.billing_month,cycle.closing_date,cycle.due_date,'FUTURE',s.currency) on conflict(card_id,reference_month) do nothing;
    select id into inv from public.invoices where card_id=card.id and reference_month=cycle.billing_month;
   end if;
   insert into public.transactions(user_id,account_id,card_id,invoice_id,subscription_id,category_id,occurred_at,due_date,description,merchant_name,merchant_key,amount,direction,currency,status,source,projection_key)
   values(u,s.account_id,s.card_id,inv,s.id,s.category_id,(d::timestamp+interval '12 hours') at time zone (select timezone from public.users where id=u),
    case when inv is null then d else cycle.due_date end,s.name,s.name,s.merchant_key,s.amount,'expense',s.currency,'pending','projection','subscription:'||s.id||':'||d)
   on conflict(user_id,projection_key) do nothing;
   n:=n+1;idx:=idx+1;
   if idx>400 then raise exception 'Recorrência muito antiga; ajuste a próxima data'; end if;
   d:=case s.interval_unit when 'day' then anchor+idx*s.interval_count when 'week' then anchor+7*idx*s.interval_count
     when 'month' then (anchor+make_interval(months=>idx*s.interval_count))::date
     else (anchor+make_interval(years=>idx*s.interval_count))::date end;
  end loop;
  update public.subscriptions set next_due_date=d where id=s.id;
 end loop;
 return n;
end; $$;

-- Reconciliação explícita para projeções sem identificador confiável.
create function public.reconcile_projection(p_projection uuid,p_actual uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.transactions; a public.transactions; u uuid:=auth.uid();
begin
 select * into strict p from public.transactions where id=p_projection and user_id=u for update;
 select * into strict a from public.transactions where id=p_actual and user_id=u for update;
 if p.source<>'projection' or a.source='projection' or a.status='cancelled' or p.card_id is distinct from a.card_id or p.account_id is distinct from a.account_id or p.currency<>a.currency then raise exception 'Reconciliação inválida'; end if;
 if p.installment_plan_id is not null then
  if p.installment_number is distinct from a.installment_number or p.total_installments is distinct from a.total_installments then raise exception 'Número de parcela divergente'; end if;
  -- Libera o slot plano/parcela antes de mover o lançamento real para ele.
  update public.transactions set status='cancelled',needs_review=false,projection_key='retired:'||id,installment_plan_id=null,installment_number=null,total_installments=null where id=p.id;
  if a.installment_plan_id is not null and a.installment_plan_id<>p.installment_plan_id then
   update public.transactions set status='cancelled',needs_review=false where installment_plan_id=a.installment_plan_id and source='projection';
  end if;
  update public.transactions set installment_plan_id=p.installment_plan_id,projection_key=p.projection_key,needs_review=false where id=a.id;
  update public.installment_plans set match_status='confirmed' where id=p.installment_plan_id;
  update public.transactions set needs_review=false where installment_plan_id=p.installment_plan_id;
 else
  update public.transactions set status='cancelled',needs_review=false where id=p.id;
  update public.transactions set subscription_id=coalesce(p.subscription_id,subscription_id),needs_review=false where id=a.id;
 end if;
end; $$;
revoke all on function public.create_manual_transaction(jsonb),public.schedule_subscriptions(date),public.reconcile_projection(uuid,uuid) from public,anon;
grant execute on function public.auro_cycle(date,integer,integer,boolean),public.auro_month_day(date,integer),public.create_manual_transaction(jsonb),public.schedule_subscriptions(date),public.reconcile_projection(uuid,uuid) to authenticated;
commit;
