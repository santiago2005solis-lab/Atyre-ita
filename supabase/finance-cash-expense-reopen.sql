begin;

create or replace function public.finance_cash_expense_reopen(
  p_document_id uuid
)
returns public.finance_cash_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.finance_cash_expenses;
begin
  select *
    into v_document
    from public.finance_cash_expenses
    where id = p_document_id
    for update;

  if v_document.id is null then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_document.status <> 'anulado' then
    raise exception 'Solo se pueden reabrir comprobantes anulados.';
  end if;

  update public.finance_cash_expenses
  set
    status = 'pendiente',
    cashbox_reviewed = false,
    updated_at = now()
  where id = p_document_id
  returning * into v_document;

  return v_document;
end;
$$;

revoke all on function public.finance_cash_expense_reopen(uuid)
  from public, anon, authenticated;
grant execute on function public.finance_cash_expense_reopen(uuid)
  to service_role;

notify pgrst, 'reload schema';

commit;
