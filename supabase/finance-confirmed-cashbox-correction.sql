begin;

create table if not exists public.finance_cashbox_change_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.finance_cash_expenses(id) on delete cascade,
  previous_cashbox_name text not null,
  new_cashbox_name text not null,
  document_status text not null,
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create index if not exists finance_cashbox_change_log_document_idx
  on public.finance_cashbox_change_log (document_id, changed_at desc);

alter table public.finance_cashbox_change_log enable row level security;

drop function if exists public.finance_cash_expense_update_document(
  uuid,
  text
);

drop function if exists public.finance_cash_expense_update_document(
  uuid,
  text,
  text
);

create function public.finance_cash_expense_update_document(
  p_document_id uuid,
  p_cashbox_name text,
  p_changed_by_name text default null
)
returns public.finance_cash_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.finance_cash_expenses;
  v_cashbox text;
begin
  select *
    into v_document
    from public.finance_cash_expenses
    where id = p_document_id
    for update;

  if v_document.id is null then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_document.status not in ('pendiente', 'confirmado') then
    raise exception 'No se puede cambiar la caja de un comprobante anulado.';
  end if;

  v_cashbox := nullif(trim(coalesce(p_cashbox_name, '')), '');
  if v_cashbox is null then
    raise exception 'Seleccione la caja que afectara el comprobante.';
  end if;

  insert into public.finance_cashboxes (name, active)
    values (v_cashbox, true)
    on conflict (name) do update set active = true;

  if v_document.status = 'confirmado'
    and v_cashbox <> v_document.cashbox_name then
    if not exists (
      select 1
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
        and movement_id is not null
    ) then
      raise exception 'El comprobante confirmado no tiene movimientos vinculados.';
    end if;

    if exists (
      select 1
      from public.finance_cash_expense_allocations a
      left join public.finance_movements m on m.id = a.movement_id
      where a.document_id = v_document.id
        and (a.movement_id is null or m.status <> 'confirmado')
    ) then
      raise exception 'Todos los movimientos vinculados deben estar confirmados.';
    end if;

    update public.finance_movements
    set cashbox_name = v_cashbox
    where id in (
      select distinct movement_id
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
        and movement_id is not null
    );
  end if;

  if v_cashbox <> v_document.cashbox_name then
    insert into public.finance_cashbox_change_log (
      document_id,
      previous_cashbox_name,
      new_cashbox_name,
      document_status,
      changed_by_name
    )
    values (
      v_document.id,
      v_document.cashbox_name,
      v_cashbox,
      v_document.status,
      nullif(trim(coalesce(p_changed_by_name, '')), '')
    );
  end if;

  update public.finance_cash_expenses
  set
    cashbox_name = v_cashbox,
    cashbox_reviewed = true,
    updated_at = now()
  where id = p_document_id
  returning * into v_document;

  return v_document;
end;
$$;

revoke all on table public.finance_cashbox_change_log
  from public, anon, authenticated;
grant select, insert on table public.finance_cashbox_change_log
  to service_role;

revoke all on function public.finance_cash_expense_update_document(
  uuid,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.finance_cash_expense_update_document(
  uuid,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
