-- AURO / PostgreSQL Supabase. Migration inicial; executar uma única vez.
-- Valores monetários em unidades decimais (BRL 10.25), nunca float.
-- Todas as relações entre dados de clientes incluem user_id.
begin;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Bahia',
  base_currency text not null default 'BRL' check (base_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Identificadores externos não são credenciais. Tokens ficam em secrets do backend.
create table public.open_finance_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pluggy_item_id text not null unique,
  status text not null default 'active' check (status in ('active','attention','revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid,
  pluggy_account_id text,
  name text not null,
  institution_name text,
  kind text not null check (kind in ('checking','savings','cash','investment','other')),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  current_balance numeric(20,2) not null default 0,
  balance_as_of timestamptz,
  include_in_forecast boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,id,currency),
  unique (connection_id,pluggy_account_id),
  check (pluggy_account_id is null or connection_id is not null),
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id)
);

-- Um cartão é uma conta CREDIT do Pluggy; não duplicar em accounts.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid,
  pluggy_account_id text,
  payment_account_id uuid,
  name text not null,
  brand text,
  last_four text check (last_four ~ '^[0-9]{4}$'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  total_limit numeric(20,2) check (total_limit >= 0),
  available_limit numeric(20,2),
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,id,currency),
  unique (connection_id,pluggy_account_id),
  check (pluggy_account_id is null or connection_id is not null),
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id),
  foreign key (user_id,payment_account_id,currency) references public.accounts(user_id,id,currency)
);

-- Categorias default são copiadas para cada usuário e permanecem editáveis.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null check (kind in ('income','expense','both')),
  icon text not null default 'tag',
  color text not null default '#0F3B2E' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  default_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,default_key)
);
create unique index categories_name_uq on public.categories(user_id,lower(name));

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  merchant_key text not null check (length(trim(merchant_key)) > 0),
  category_id uuid not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,merchant_key),
  foreign key (user_id,category_id) references public.categories(user_id,id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  card_id uuid not null,
  pluggy_bill_id text,
  reference_month date not null check (extract(day from reference_month) = 1),
  closing_date date not null,
  due_date date not null,
  status text not null check (status in ('FUTURE','OPEN','CLOSED')),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  -- null = desconhecido; não tratar como zero. Total bancário prevalece sobre estimativa.
  reported_total numeric(20,2),
  estimated_total numeric(20,2) not null default 0,
  total_paid numeric(20,2) not null default 0 check (total_paid >= 0),
  remaining_due numeric(20,2) generated always as
    (greatest(coalesce(reported_total,estimated_total) - total_paid,0)) stored,
  source text not null default 'estimated' check (source in ('estimated','pluggy','manual')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= closing_date),
  unique (user_id,id), unique (user_id,card_id,id),
  unique (card_id,reference_month), unique (card_id,pluggy_bill_id),
  foreign key (user_id,card_id,currency) references public.cards(user_id,id,currency)
);

-- Grupo interno: o Open Finance não fornece um ID universal de compra parcelada.
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  card_id uuid not null,
  merchant_name text,
  purchase_date date,
  total_installments integer not null check (total_installments >= 2),
  total_amount numeric(20,2) check (total_amount >= 0),
  match_status text not null default 'unverified' check (match_status in ('unverified','confirmed','ambiguous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,card_id,id,total_installments),
  foreign key (user_id,card_id) references public.cards(user_id,id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid,
  card_id uuid,
  category_id uuid,
  name text not null,
  merchant_key text,
  icon text not null default 'repeat',
  amount numeric(20,2) not null check (amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  interval_unit text not null default 'month' check (interval_unit in ('day','week','month','year')),
  interval_count integer not null default 1 check (interval_count > 0),
  next_due_date date not null,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(account_id,card_id) = 1),
  unique (user_id,id),
  foreign key (user_id,account_id,currency) references public.accounts(user_id,id,currency),
  foreign key (user_id,card_id,currency) references public.cards(user_id,id,currency),
  foreign key (user_id,category_id) references public.categories(user_id,id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid,
  card_id uuid,
  invoice_id uuid,
  category_id uuid,
  subscription_id uuid,
  connection_id uuid,
  pluggy_transaction_id text,
  occurred_at timestamptz not null,
  due_date date,
  settled_at timestamptz,
  description text not null,
  merchant_name text,
  merchant_key text,
  icon text not null default 'receipt',
  amount numeric(20,2) not null check (amount >= 0),
  direction text not null check (direction in ('income','expense')),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  kind text not null default 'regular' check (kind in ('regular','transfer','invoice_payment','investment_transfer')),
  payment_method text,
  status text not null check (status in ('pending','posted','cancelled')),
  source text not null check (source in ('manual','pluggy','projection')),
  provider_status text,
  category_source text not null default 'uncategorized' check (category_source in ('uncategorized','provider','rule','manual')),
  installment_plan_id uuid,
  installment_number integer,
  total_installments integer,
  defer_to_next_month boolean not null default false,
  -- Datas concretas e invoice_id definem o ciclo; o booleano é uma decisão registrada.
  billing_month date check (extract(day from billing_month) = 1),
  projection_key text,
  provider_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(account_id,card_id) = 1),
  check (invoice_id is null or card_id is not null),
  check (not defer_to_next_month or card_id is not null),
  check (billing_month is null or card_id is not null),
  check ((installment_number is null and total_installments is null) or
    (installment_number is not null and total_installments is not null and
     installment_number between 1 and total_installments and total_installments >= 1)),
  check (installment_plan_id is null or
    (card_id is not null and installment_number is not null and total_installments >= 2)),
  check ((source = 'pluggy' and pluggy_transaction_id is not null and connection_id is not null)
    or (source <> 'pluggy' and pluggy_transaction_id is null)),
  check (source <> 'projection' or (status in ('pending','cancelled') and projection_key is not null)),
  unique (user_id,id), unique (user_id,id,currency),
  unique (connection_id,pluggy_transaction_id), unique (user_id,projection_key),
  unique (installment_plan_id,installment_number),
  foreign key (user_id,account_id,currency) references public.accounts(user_id,id,currency),
  foreign key (user_id,card_id,currency) references public.cards(user_id,id,currency),
  foreign key (user_id,card_id,invoice_id) references public.invoices(user_id,card_id,id),
  foreign key (user_id,category_id) references public.categories(user_id,id),
  foreign key (user_id,subscription_id) references public.subscriptions(user_id,id),
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id),
  foreign key (user_id,card_id,installment_plan_id,total_installments)
    references public.installment_plans(user_id,card_id,id,total_installments)
);

-- Pagamentos bancários de fatura devem ser reconciliados; não somar duas vezes.
create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  invoice_id uuid not null,
  transaction_id uuid not null,
  amount numeric(20,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id,id), unique (invoice_id,transaction_id),
  foreign key (user_id,invoice_id) references public.invoices(user_id,id),
  foreign key (user_id,transaction_id) references public.transactions(user_id,id)
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null,
  connection_id uuid,
  pluggy_investment_id text,
  name text not null,
  ticker text,
  asset_class text not null check (asset_class in ('fixed_income','equity','fund','reit','other')),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  quantity numeric(28,10) check (quantity >= 0),
  cost_basis numeric(20,2),
  current_value numeric(20,2),
  valued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (user_id,id,currency),
  unique (connection_id,pluggy_investment_id),
  check (pluggy_investment_id is null or connection_id is not null),
  foreign key (user_id,account_id,currency) references public.accounts(user_id,id,currency),
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id)
);

create table public.investment_income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  investment_id uuid not null,
  transaction_id uuid,
  provider_event_id text,
  kind text not null check (kind in ('dividend','interest','jcp','distribution','other')),
  payment_date date not null,
  net_amount numeric(20,2) not null check (net_amount >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('expected','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,id), unique (investment_id,provider_event_id),
  foreign key (user_id,investment_id,currency) references public.investments(user_id,id,currency),
  foreign key (user_id,transaction_id,currency) references public.transactions(user_id,id,currency)
);

-- Infraestrutura de ingestão: somente o backend pode escrever nestas tabelas.
create table public.sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid not null,
  resource_key text not null,
  query_parameters jsonb not null default '{}'::jsonb,
  next_cursor text,
  status text not null default 'idle' check (status in ('idle','running','complete','failed')),
  lease_until timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (connection_id,resource_key),
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  connection_id uuid not null,
  event_key text not null unique,
  event_type text not null,
  resource_id text,
  status text not null default 'received' check (status in ('received','processing','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  foreign key (user_id,connection_id) references public.open_finance_connections(user_id,id)
);

create index transactions_calendar_idx on public.transactions(user_id,occurred_at);
create index transactions_due_idx on public.transactions(user_id,due_date) where status = 'pending';
create index transactions_merchant_idx on public.transactions(user_id,merchant_key);
create index transactions_invoice_idx on public.transactions(user_id,invoice_id);
create index transactions_account_idx on public.transactions(user_id,account_id);
create index transactions_card_idx on public.transactions(user_id,card_id);
create index invoices_due_idx on public.invoices(user_id,due_date);
create index investment_income_date_idx on public.investment_income(user_id,payment_date);
create index subscriptions_due_idx on public.subscriptions(user_id,next_due_date) where status = 'active';
create index webhook_pending_idx on public.webhook_events(status,received_at) where status <> 'processed';

create function public.auro_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Somente edições classificadas como manuais geram regra; sync deve preservar esse override.
create function public.auro_remember_category() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.category_source = 'manual' and new.category_id is not null
     and nullif(trim(new.merchant_key),'') is not null
     and (new.category_id is distinct from old.category_id
          or new.category_source is distinct from old.category_source) then
    insert into public.category_rules(user_id,merchant_key,category_id)
    values (new.user_id,new.merchant_key,new.category_id)
    on conflict (user_id,merchant_key) do update
      set category_id = excluded.category_id, enabled = true;
  end if;
  return new;
end;
$$;
create trigger transactions_remember_category after update of category_id,category_source
  on public.transactions for each row execute function public.auro_remember_category();

-- Profile e categorias nascem na mesma transação de criação do usuário.
create function public.auro_on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users(id,display_name) values (new.id,new.raw_user_meta_data ->> 'name');
  insert into public.categories(user_id,name,kind,icon,default_key) values
    (new.id,'Alimentação','expense','utensils','food'),
    (new.id,'Moradia','expense','house','housing'),
    (new.id,'Transporte','expense','car','transport'),
    (new.id,'Saúde','expense','heart','health'),
    (new.id,'Educação','expense','book','education'),
    (new.id,'Lazer','expense','sparkles','leisure'),
    (new.id,'Assinaturas','expense','repeat','subscriptions'),
    (new.id,'Salário','income','briefcase','salary'),
    (new.id,'Proventos','income','chart-line','investment_income'),
    (new.id,'Outros','both','tag','other');
  return new;
end;
$$;
create trigger auro_auth_user_created after insert on auth.users
  for each row execute function public.auro_on_auth_user_created();

-- Backfill para usuários já existentes no projeto.
insert into public.users(id,display_name)
select id,raw_user_meta_data ->> 'name' from auth.users on conflict (id) do nothing;
insert into public.categories(user_id,name,kind,icon,default_key)
select u.id,c.name,c.kind,c.icon,c.key from public.users u cross join
  (values ('Alimentação','expense','utensils','food'),('Moradia','expense','house','housing'),
    ('Transporte','expense','car','transport'),('Saúde','expense','heart','health'),
    ('Educação','expense','book','education'),('Lazer','expense','sparkles','leisure'),
    ('Assinaturas','expense','repeat','subscriptions'),('Salário','income','briefcase','salary'),
    ('Proventos','income','chart-line','investment_income'),('Outros','both','tag','other'))
  as c(name,kind,icon,key) on conflict (user_id,default_key) do nothing;

-- Políticas por operação; RLS + FKs compostas protegem o isolamento entre clientes.
do $$
declare t text;
begin
  foreach t in array array['users','open_finance_connections','accounts','cards','categories',
    'category_rules','invoices','installment_plans','subscriptions','transactions',
    'invoice_payments','investments','investment_income','sync_checkpoints','webhook_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    if t = 'users' then
      execute 'grant select, update on public.users to authenticated';
      execute 'create policy own_select on public.users for select to authenticated using ((select auth.uid()) = id)';
      execute 'create policy own_update on public.users for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id)';
    elsif t in ('open_finance_connections','sync_checkpoints','webhook_events') then
      -- Item ownership é estabelecido pelo servidor, nunca pelo payload do cliente.
      if t = 'open_finance_connections' then
        execute format('grant select on public.%I to authenticated',t);
        execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
      end if;
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated',t);
      execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
      execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t);
      execute format('create policy own_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
      execute format('create policy own_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t);
    end if;
    if t not in ('invoice_payments','webhook_events') then
      execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.auro_touch_updated_at()',t);
    end if;
  end loop;
end;
$$;

revoke all on function public.auro_touch_updated_at() from public,anon,authenticated;
revoke all on function public.auro_remember_category() from public,anon,authenticated;
revoke all on function public.auro_on_auth_user_created() from public,anon,authenticated;

-- Eventos do Realtime para invalidar consultas; o cálculo será implementado na RPC.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['accounts','cards','transactions','invoices','subscriptions','investments','investment_income'] loop
      if not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end;
$$;

commit;
