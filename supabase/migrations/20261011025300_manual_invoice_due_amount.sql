begin;

alter table public.invoices drop column remaining_due;
alter table public.invoices add column remaining_due numeric(20,2) generated always as
  (
    case
      when manual_total is not null then manual_total
      else greatest(coalesce(reported_total,estimated_total)-total_paid,0)
    end
  ) stored;

comment on column public.invoices.manual_total is
  'Correção do usuário para o valor ainda devido; prevalece sobre total e pagamentos informados pela integração.';

commit;
