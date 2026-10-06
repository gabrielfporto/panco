begin;
alter table public.investment_income add column amount_basis text not null default 'net' check(amount_basis in ('net','gross'));

-- Evita manter cobranças futuras de uma assinatura que foi pausada/cancelada.
create function public.auro_subscription_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'active' and old.status='active' then
  update public.transactions set status='cancelled' where subscription_id=new.id and user_id=new.user_id
    and source='projection' and status='pending' and occurred_at::date>=current_date;
 end if;
 return new;
end; $$;
create trigger subscription_changed after update of status on public.subscriptions for each row execute function public.auro_subscription_changed();
revoke all on function public.auro_subscription_changed() from public,anon,authenticated;

-- Vínculos de pagamento não podem ficar inválidos após edição do débito original.
create function public.auro_guard_allocated_transaction() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.invoice_payments p where p.transaction_id=old.id) then
  if new.account_id is null or new.direction<>'expense' or new.currency<>old.currency
    or new.amount<(select sum(p.amount) from public.invoice_payments p where p.transaction_id=old.id) then
   raise exception 'Remova ou ajuste a alocação de pagamento antes de editar o débito';
  end if;
 end if;
 return new;
end; $$;
create trigger guard_allocated_transaction before update on public.transactions for each row execute function public.auro_guard_allocated_transaction();
revoke all on function public.auro_guard_allocated_transaction() from public,anon,authenticated;
commit;
