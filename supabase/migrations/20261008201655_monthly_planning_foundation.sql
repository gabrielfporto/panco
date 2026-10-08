begin;
alter table public.users add column planning_initialized_at timestamptz;
alter table public.categories add column expense_group text check (expense_group in ('essential','non_essential'));
alter table public.categories add column sort_order integer not null default 0;
alter table public.categories add constraint categories_income_group_check check (kind <> 'income' or expense_group is null);
alter table public.monthly_budgets add column created_at timestamptz not null default now();
alter table public.monthly_budgets add column updated_at timestamptz not null default now();
create trigger touch_updated_at before update on public.monthly_budgets for each row execute function public.auro_touch_updated_at();

-- Called once per login. Exact names are reused; existing IDs, kinds and archives survive.
create function public.panco_initialize_planning() returns void
language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); r record; initialized timestamptz;
begin
 if u is null then raise exception 'Autenticação necessária'; end if;
 select planning_initialized_at into strict initialized from public.users where id=u for update;
 if initialized is not null then return; end if;
 for r in select * from (values
 ('Mesada','income',null::text,1),('Prestação de Serviços','income',null,2),
 ('Ressarcimentos','income',null,3),('Inquilino','income',null,4),
 ('Dinheiro emprestado','income',null,5),('Outros ganhos','income',null,6),('SaaS','income',null,7),
 ('Aluguel','expense','essential',10),('Farmácia','expense','essential',11),
 ('Contas Residenciais','expense','essential',12),('Alimentação e feira','expense','essential',13),
 ('Transporte','expense','essential',14),('Cuidados Pessoais','expense','essential',15),
 ('Saúde','expense','essential',16),('Imprevistos','expense','essential',17),
 ('Parcelas','expense','essential',18),('Estacionamento','expense','essential',19),('Gasolina','expense','essential',20),
 ('Gastos gerais','expense','non_essential',30),('Roupas','expense','non_essential',31),
 ('Compras','expense','non_essential',32),('Atividades de Lazer','expense','non_essential',33),
 ('Alimentação fora','expense','non_essential',34),('Assinaturas de Streaming','expense','non_essential',35),
 ('Presentes','expense','non_essential',36),('Viagens','expense','non_essential',37),('Manutenção do Carro','expense','non_essential',38)
 ) as defaults(name,kind,expense_group,sort_order) loop
  insert into public.categories(user_id,name,kind,expense_group,sort_order,color)
  values(u,r.name,r.kind,r.expense_group,r.sort_order,'#334F92') on conflict do nothing;
 end loop;
-- Existing names can be assigned once, without replacing their IDs or the user's type.
update public.categories set expense_group=case
 when lower(name) in ('aluguel','farmácia','contas residenciais','alimentação e feira','transporte','cuidados pessoais','saúde','imprevistos','parcelas','estacionamento','gasolina') then 'essential'
 when lower(name) in ('gastos gerais','roupas','compras','atividades de lazer','alimentação fora','assinaturas de streaming','presentes','viagens','manutenção do carro') then 'non_essential'
 end where user_id=u and kind='expense' and expense_group is null;

 update public.users set planning_initialized_at=now() where id=u;
end; $$;
revoke all on function public.panco_initialize_planning() from public,anon;
grant execute on function public.panco_initialize_planning() to authenticated;

create function public.monthly_overview(p_month date,p_currency text default 'BRL') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare u uuid:=auth.uid(); tz text; result jsonb;
begin
 if u is null then raise exception 'Autenticação necessária'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_currency<>'BRL' then raise exception 'Informe o primeiro dia do mês e a moeda BRL'; end if;
 select timezone into strict tz from public.users where id=u;
 with actual as (
  select t.category_id,t.direction,sum(t.amount) amount
  from public.transactions t
  where t.user_id=u and t.currency=p_currency and t.status='posted' and t.source<>'projection' and t.kind='regular'
   and not (t.account_id is not null and public.panco_ignored_transaction(t.description,t.merchant_name))
   and not exists(select 1 from public.invoice_payments p where p.user_id=u and p.transaction_id=t.id)
   and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone tz)::date end)>=p_month
   and (case when t.source='pluggy' then (t.occurred_at at time zone 'UTC')::date else (t.occurred_at at time zone tz)::date end)<(p_month+interval '1 month')::date
  group by t.category_id,t.direction
 ), planned as (
  select category_id,direction,amount from public.monthly_budgets where user_id=u and month=p_month
 ), keys as (
  select c.id category_id,d.direction from public.categories c cross join (values('income'),('expense')) d(direction)
   where c.user_id=u and c.archived_at is null and (c.kind=d.direction or c.kind='both')
  union select category_id,direction from actual
  union select category_id,direction from planned
 ), lines as (
  select k.category_id,k.direction,coalesce(c.name,'Sem categoria') name,c.archived_at is not null archived,
   case when k.direction='expense' then c.expense_group end expense_group,coalesce(c.sort_order,2147483647) sort_order,
   coalesce(b.amount,0) estimated,coalesce(a.amount,0) actual
  from keys k left join public.categories c on c.id=k.category_id and c.user_id=u
  left join planned b on b.category_id=k.category_id and b.direction=k.direction
  left join actual a on a.category_id is not distinct from k.category_id and a.direction=k.direction
 ), totals as (
  select coalesce(sum(estimated) filter(where direction='income'),0) estimated_income,
   coalesce(sum(estimated) filter(where direction='expense'),0) estimated_expense,
   coalesce(sum(actual) filter(where direction='income'),0) actual_income,
   coalesce(sum(actual) filter(where direction='expense'),0) actual_expense from lines
 )
 select jsonb_build_object('month',p_month,'currency',p_currency,
  'estimated_income',estimated_income::text,'estimated_expense',estimated_expense::text,
  'actual_income',actual_income::text,'actual_expense',actual_expense::text,
  'estimated_result',(estimated_income-estimated_expense)::text,'actual_result',(actual_income-actual_expense)::text,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('category_id',category_id,'name',name,'direction',direction,
   'expense_group',expense_group,'archived',archived,'estimated',estimated::text,'actual',actual::text,
   'difference',(case when direction='income' then actual-estimated else estimated-actual end)::text)
   order by sort_order,name,direction) from lines),'[]'::jsonb)) into result from totals;
 return result;
end; $$;
revoke all on function public.monthly_overview(date,text) from public,anon;
grant execute on function public.monthly_overview(date,text) to authenticated;

do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['categories','monthly_budgets'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end; $$;
commit;
