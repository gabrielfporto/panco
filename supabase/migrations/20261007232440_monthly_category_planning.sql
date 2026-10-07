create table public.monthly_budgets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 month date not null check (extract(day from month)=1),
 category_id uuid not null,
 direction text not null check (direction in ('income','expense')),
 amount numeric(20,2) not null check(amount>=0),
 unique(user_id,month,category_id,direction),
 foreign key(user_id,category_id) references public.categories(user_id,id)
);
alter table public.monthly_budgets enable row level security;
create policy monthly_budgets_owner_select on public.monthly_budgets for select to authenticated using ((select auth.uid())=user_id);
create policy monthly_budgets_owner_insert on public.monthly_budgets for insert to authenticated with check ((select auth.uid())=user_id);
create policy monthly_budgets_owner_update on public.monthly_budgets for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy monthly_budgets_owner_delete on public.monthly_budgets for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.monthly_budgets from anon;
grant select,insert,update,delete on public.monthly_budgets to authenticated;
grant all on public.monthly_budgets to service_role;
