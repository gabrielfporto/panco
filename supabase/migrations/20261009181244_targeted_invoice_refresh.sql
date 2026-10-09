begin;
-- Rebuilding every invoice for every imported transaction was quadratic.
-- The existing (user_id,invoice_id) index serves the targeted recalculation.
create function public.panco_rebuild_invoice(p_user uuid,p_invoice uuid) returns void
language sql security invoker set search_path='' as $$
 update public.invoices i set estimated_total=coalesce((
   select sum(case t.direction when 'expense' then t.amount else -t.amount end)
   from public.transactions t where t.invoice_id=i.id and t.user_id=p_user
     and t.status<>'cancelled' and (not t.needs_review or t.source<>'projection') and t.kind<>'invoice_payment'),0),
 total_paid=greatest(i.provider_paid,coalesce((select sum(p.amount) from public.invoice_payments p
   join public.transactions t on t.id=p.transaction_id and t.user_id=p.user_id
   where p.invoice_id=i.id and p.user_id=p_user and t.status='posted'),0))
 where i.user_id=p_user and i.id=p_invoice;
$$;
revoke all on function public.panco_rebuild_invoice(uuid,uuid) from public,anon;
grant execute on function public.panco_rebuild_invoice(uuid,uuid) to authenticated,service_role;

create or replace function public.auro_refresh_after_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare u uuid; old_invoice uuid; new_invoice uuid; linked uuid;
begin
 u:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 if tg_op<>'INSERT' then old_invoice:=old.invoice_id; end if;
 if tg_op<>'DELETE' then new_invoice:=new.invoice_id; end if;
 if old_invoice is not null then perform public.panco_rebuild_invoice(u,old_invoice); end if;
 if new_invoice is not null and new_invoice is distinct from old_invoice then perform public.panco_rebuild_invoice(u,new_invoice); end if;
 -- A bank debit's status/amount may also affect an explicitly allocated bill.
 if tg_table_name='transactions' then
  for linked in select distinct invoice_id from public.invoice_payments
    where user_id=u and transaction_id=case when tg_op='DELETE' then old.id else new.id end
  loop
   if linked is distinct from old_invoice and linked is distinct from new_invoice then perform public.panco_rebuild_invoice(u,linked); end if;
  end loop;
 end if;
 return null;
end; $$;
commit;
