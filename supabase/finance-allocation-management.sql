-- Gestion de divisiones de costo en comprobantes pendientes.
-- Ejecutar despues de finance-classification-update.sql.

drop function if exists public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text
);

create or replace function public.finance_cash_expense_update_allocation(
  p_allocation_id uuid,
  p_linked_module text,
  p_account_name text,
  p_cost_center_name text,
  p_cost_object_name text,
  p_amount numeric,
  p_detail text
)
returns public.finance_cash_expense_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.finance_cash_expense_allocations;
  v_document_status text;
begin
  select *
    into v_allocation
    from public.finance_cash_expense_allocations
    where id = p_allocation_id
    for update;

  if v_allocation.id is null then
    raise exception 'Distribucion no encontrada.';
  end if;

  select status
    into v_document_status
    from public.finance_cash_expenses
    where id = v_allocation.document_id
    for update;

  if v_document_status <> 'pendiente' then
    raise exception 'Solo se pueden modificar comprobantes pendientes.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto de la distribucion debe ser mayor a cero.';
  end if;
  if p_linked_module not in (
    'Ganadero',
    'Agricola',
    'Maquinarias',
    'Recursos Humanos',
    'Financiero',
    'Deposito',
    'General'
  ) then
    raise exception 'Modulo vinculado no valido.';
  end if;

  insert into public.cost_centers (name, linked_module, active)
    values (trim(p_cost_center_name), p_linked_module, true)
    on conflict (name) do update set active = true;

  update public.finance_cash_expense_allocations
  set
    linked_module = p_linked_module,
    account_name = trim(p_account_name),
    cost_center_name = trim(p_cost_center_name),
    cost_object_name = nullif(trim(coalesce(p_cost_object_name, '')), ''),
    detail = nullif(trim(coalesce(p_detail, '')), ''),
    amount = p_amount,
    mapping_status = 'revisado'
  where id = p_allocation_id
  returning * into v_allocation;

  return v_allocation;
end;
$$;

create or replace function public.finance_cash_expense_add_allocation(
  p_document_id uuid,
  p_linked_module text,
  p_account_name text,
  p_cost_center_name text,
  p_cost_object_name text,
  p_amount numeric,
  p_detail text
)
returns public.finance_cash_expense_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.finance_cash_expense_allocations;
  v_document_status text;
  v_line_number integer;
begin
  select status
    into v_document_status
    from public.finance_cash_expenses
    where id = p_document_id
    for update;

  if v_document_status is null then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_document_status <> 'pendiente' then
    raise exception 'Solo se pueden agregar divisiones a comprobantes pendientes.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto de la distribucion debe ser mayor a cero.';
  end if;
  if p_linked_module not in (
    'Ganadero',
    'Agricola',
    'Maquinarias',
    'Recursos Humanos',
    'Financiero',
    'Deposito',
    'General'
  ) then
    raise exception 'Modulo vinculado no valido.';
  end if;

  insert into public.cost_centers (name, linked_module, active)
    values (trim(p_cost_center_name), p_linked_module, true)
    on conflict (name) do update set active = true;

  select coalesce(max(line_number), 0) + 1
    into v_line_number
    from public.finance_cash_expense_allocations
    where document_id = p_document_id;

  insert into public.finance_cash_expense_allocations (
    document_id,
    line_number,
    source_category,
    source_subcategory,
    detail,
    amount,
    linked_module,
    account_name,
    cost_center_name,
    cost_object_name,
    mapping_status
  )
  values (
    p_document_id,
    v_line_number,
    p_linked_module,
    trim(p_cost_center_name),
    nullif(trim(coalesce(p_detail, '')), ''),
    p_amount,
    p_linked_module,
    trim(p_account_name),
    trim(p_cost_center_name),
    nullif(trim(coalesce(p_cost_object_name, '')), ''),
    'revisado'
  )
  returning * into v_allocation;

  return v_allocation;
end;
$$;

create or replace function public.finance_cash_expense_delete_allocation(
  p_allocation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.finance_cash_expense_allocations;
  v_count integer;
begin
  select *
    into v_allocation
    from public.finance_cash_expense_allocations
    where id = p_allocation_id
    for update;

  if v_allocation.id is null then
    raise exception 'Distribucion no encontrada.';
  end if;

  perform 1
    from public.finance_cash_expenses
    where id = v_allocation.document_id
      and status = 'pendiente'
    for update;

  if not found then
    raise exception 'Solo se pueden eliminar divisiones de comprobantes pendientes.';
  end if;

  select count(*)
    into v_count
    from public.finance_cash_expense_allocations
    where document_id = v_allocation.document_id;

  if v_count <= 1 then
    raise exception 'El comprobante debe conservar al menos una distribucion.';
  end if;

  delete from public.finance_cash_expense_allocations
  where id = p_allocation_id;

  return p_allocation_id;
end;
$$;

create or replace function public.finance_cash_expense_transition(
  p_document_id uuid,
  p_target_status text
)
returns public.finance_cash_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.finance_cash_expenses;
  v_group record;
  v_movement_id uuid;
  v_allocation_count integer;
  v_allocation_total numeric;
begin
  select *
    into v_document
    from public.finance_cash_expenses
    where id = p_document_id
    for update;

  if v_document.id is null then
    raise exception 'Comprobante no encontrado.';
  end if;

  if p_target_status = 'confirmado' then
    if v_document.status <> 'pendiente' then
      raise exception 'Solo se pueden confirmar comprobantes pendientes.';
    end if;
    if not v_document.cashbox_reviewed then
      raise exception 'Revise y guarde la caja que afectara el comprobante.';
    end if;

    select count(*), coalesce(sum(amount), 0)
      into v_allocation_count, v_allocation_total
      from public.finance_cash_expense_allocations
      where document_id = v_document.id;

    if v_allocation_count = 0 then
      raise exception 'El comprobante debe tener al menos una distribucion.';
    end if;
    if abs(v_allocation_total - v_document.total_amount) > 0.01 then
      raise exception 'El total distribuido debe coincidir con el total del comprobante.';
    end if;
    if exists (
      select 1
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
        and mapping_status <> 'revisado'
    ) then
      raise exception 'Revise la clasificacion de todas las distribuciones.';
    end if;

    for v_group in
      select
        linked_module,
        account_name,
        cost_center_name,
        nullif(trim(coalesce(cost_object_name, '')), '') as cost_object_name,
        sum(amount) as amount,
        min(source_category) as category,
        string_agg(
          nullif(trim(coalesce(detail, '')), ''),
          ' | '
          order by line_number
        ) as detail,
        array_agg(id order by line_number) as allocation_ids
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
      group by
        linked_module,
        account_name,
        cost_center_name,
        nullif(trim(coalesce(cost_object_name, '')), '')
      order by linked_module, account_name, cost_center_name
    loop
      insert into public.finance_movements (
        cashbox_name,
        linked_module,
        account_name,
        cost_center_name,
        cost_object_name,
        movement_type,
        movement_date,
        concept,
        category,
        amount,
        currency,
        source_module,
        status,
        payment_method,
        document_number,
        responsible,
        related_party,
        notes
      )
      values (
        v_document.cashbox_name,
        v_group.linked_module,
        v_group.account_name,
        v_group.cost_center_name,
        v_group.cost_object_name,
        'egreso',
        v_document.document_date,
        concat_ws(
          ' - ',
          v_document.description,
          v_group.cost_object_name,
          v_group.detail
        ),
        v_group.category,
        v_group.amount,
        'PYG',
        'gastos_caja',
        'confirmado',
        v_document.payment_method,
        v_document.document_number,
        v_document.responsible,
        v_document.supplier,
        v_document.notes
      )
      returning id into v_movement_id;

      update public.finance_cash_expense_allocations
      set movement_id = v_movement_id
      where id = any(v_group.allocation_ids);
    end loop;

    update public.finance_cash_expenses
    set status = 'confirmado', updated_at = now()
    where id = v_document.id
    returning * into v_document;

    return v_document;
  end if;

  if p_target_status = 'anulado' then
    if v_document.status not in ('pendiente', 'confirmado') then
      raise exception 'El comprobante ya esta anulado.';
    end if;

    update public.finance_movements
    set status = 'anulado'
    where id in (
      select movement_id
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
        and movement_id is not null
    );

    update public.finance_cash_expenses
    set status = 'anulado', updated_at = now()
    where id = v_document.id
    returning * into v_document;

    return v_document;
  end if;

  raise exception 'Cambio de estado no permitido.';
end;
$$;

revoke all on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  text
) from public, anon, authenticated;

revoke all on function public.finance_cash_expense_add_allocation(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  text
) from public, anon, authenticated;

revoke all on function public.finance_cash_expense_delete_allocation(uuid)
  from public, anon, authenticated;

grant execute on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  text
) to service_role;

grant execute on function public.finance_cash_expense_add_allocation(
  uuid,
  text,
  text,
  text,
  text,
  numeric,
  text
) to service_role;

grant execute on function public.finance_cash_expense_delete_allocation(uuid)
  to service_role;

notify pgrst, 'reload schema';
