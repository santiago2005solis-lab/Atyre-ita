begin;

alter table public.finance_accounts
  add column if not exists code text;

alter table public.finance_accounts
  add column if not exists parent_name text;

alter table public.finance_accounts
  add column if not exists postable boolean not null default true;

create unique index if not exists finance_accounts_code_idx
  on public.finance_accounts (code)
  where code is not null and code <> '';

insert into public.finance_accounts (
  name,
  account_type,
  linked_module,
  code,
  parent_name,
  postable,
  active
)
values
  (
    'Gastos administrativos',
    'egreso',
    'Financiero',
    '5.1',
    null,
    false,
    true
  ),
  ('Sueldos administrativos', 'egreso', 'Recursos Humanos', '5.1.01', 'Gastos administrativos', true, true),
  ('Jornales administrativos', 'egreso', 'Recursos Humanos', '5.1.02', 'Gastos administrativos', true, true),
  ('IPS y cargas sociales', 'egreso', 'Recursos Humanos', '5.1.03', 'Gastos administrativos', true, true),
  ('Honorarios profesionales', 'egreso', 'Financiero', '5.1.04', 'Gastos administrativos', true, true),
  ('Papeleria y utiles', 'egreso', 'Financiero', '5.1.05', 'Gastos administrativos', true, true),
  ('Energia electrica administrativa', 'egreso', 'Financiero', '5.1.06', 'Gastos administrativos', true, true),
  ('Agua administrativa', 'egreso', 'Financiero', '5.1.07', 'Gastos administrativos', true, true),
  ('Internet y telefonia', 'egreso', 'Financiero', '5.1.08', 'Gastos administrativos', true, true),
  ('Viaticos y movilidad administrativa', 'egreso', 'Financiero', '5.1.09', 'Gastos administrativos', true, true),
  ('Combustible de vehiculos administrativos', 'egreso', 'Financiero', '5.1.10', 'Gastos administrativos', true, true),
  ('Repuestos de vehiculos administrativos', 'egreso', 'Financiero', '5.1.11', 'Gastos administrativos', true, true),
  ('Mantenimiento de vehiculos administrativos', 'egreso', 'Financiero', '5.1.12', 'Gastos administrativos', true, true),
  ('Seguros administrativos', 'egreso', 'Financiero', '5.1.13', 'Gastos administrativos', true, true),
  ('Comisiones y gastos bancarios', 'egreso', 'Financiero', '5.1.14', 'Gastos administrativos', true, true),
  ('Otros gastos administrativos', 'egreso', 'Financiero', '5.1.99', 'Gastos administrativos', true, true)
on conflict (name) do update
set
  account_type = excluded.account_type,
  linked_module = excluded.linked_module,
  code = excluded.code,
  parent_name = excluded.parent_name,
  postable = excluded.postable,
  active = true;

alter table public.cost_centers
  add column if not exists code text;

alter table public.cost_centers
  add column if not exists center_type text not null default 'operativo';

create unique index if not exists cost_centers_code_idx
  on public.cost_centers (code)
  where code is not null and code <> '';

insert into public.cost_centers (
  name,
  linked_module,
  code,
  center_type,
  active
)
values
  ('Administracion General', 'Financiero', 'ADM-GRAL', 'administrativo', true),
  ('Administracion CDE', 'Financiero', 'ADM-CDE', 'administrativo', true),
  ('Direccion', 'Financiero', 'ADM-DIR', 'administrativo', true),
  ('Tesoreria y Contabilidad', 'Financiero', 'ADM-TES', 'administrativo', true),
  ('Compras y Logistica', 'Financiero', 'ADM-COM', 'administrativo', true),
  ('Flota Administrativa', 'Financiero', 'ADM-FLOTA', 'administrativo', true),
  ('Recursos Humanos', 'Recursos Humanos', 'ADM-RRHH', 'administrativo', true)
on conflict (name) do update
set
  linked_module = excluded.linked_module,
  code = excluded.code,
  center_type = excluded.center_type,
  active = true;

alter table public.finance_cash_expenses
  add column if not exists cashbox_reviewed boolean not null default false;

update public.finance_cash_expenses
set cashbox_reviewed = true
where source = 'manual' or status <> 'pendiente';

alter table public.finance_cash_expense_allocations
  add column if not exists cost_object_name text;

alter table public.finance_movements
  add column if not exists cost_object_name text;

create index if not exists finance_cash_allocations_object_idx
  on public.finance_cash_expense_allocations (cost_object_name)
  where cost_object_name is not null and cost_object_name <> '';

create index if not exists finance_movements_object_idx
  on public.finance_movements (cost_object_name)
  where cost_object_name is not null and cost_object_name <> '';

create or replace view public.finance_cashbox_current_balance as
select
  c.name as cashbox_name,
  coalesce(
    sum(
      case
        when m.movement_type = 'ingreso' then m.amount
        when m.movement_type = 'egreso' then -m.amount
        else 0
      end
    ),
    0
  ) as balance
from public.finance_cashboxes c
left join public.finance_movements m
  on m.cashbox_name = c.name
  and m.status = 'confirmado'
where c.active = true
group by c.name;

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

create or replace function public.finance_cash_expense_create(
  p_document jsonb,
  p_allocations jsonb,
  p_created_by_name text default null
)
returns public.finance_cash_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation jsonb;
  v_cashbox text;
  v_cost_center text;
  v_document public.finance_cash_expenses;
  v_line_number integer := 0;
  v_total numeric(18, 2);
begin
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Agregue al menos una distribucion.';
  end if;

  select coalesce(sum((value ->> 'amount')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_allocations);

  if v_total <= 0 then
    raise exception 'El monto total debe ser mayor a cero.';
  end if;

  v_cashbox := coalesce(
    nullif(trim(p_document ->> 'cashboxName'), ''),
    'Caja sin clasificar'
  );

  insert into public.finance_cashboxes (name, active)
    values (v_cashbox, true)
    on conflict (name) do update set active = true;

  insert into public.finance_cash_expenses (
    document_date,
    document_number,
    supplier,
    responsible,
    payment_method,
    cashbox_name,
    cashbox_reviewed,
    description,
    notes,
    total_amount,
    source,
    status
  )
  values (
    (p_document ->> 'documentDate')::date,
    nullif(trim(coalesce(p_document ->> 'documentNumber', '')), ''),
    nullif(trim(coalesce(p_document ->> 'supplier', '')), ''),
    nullif(trim(coalesce(p_document ->> 'responsible', '')), ''),
    nullif(trim(coalesce(p_document ->> 'paymentMethod', '')), ''),
    v_cashbox,
    true,
    coalesce(nullif(trim(p_document ->> 'description'), ''), 'Gasto de caja'),
    concat_ws(
      ' | ',
      nullif(trim(coalesce(p_document ->> 'notes', '')), ''),
      case
        when nullif(trim(coalesce(p_created_by_name, '')), '') is not null
          then 'Cargado por ' || trim(p_created_by_name)
        else null
      end
    ),
    v_total,
    'manual',
    'pendiente'
  )
  returning * into v_document;

  for v_allocation in
    select value from jsonb_array_elements(p_allocations)
  loop
    v_line_number := v_line_number + 1;
    v_cost_center := coalesce(
      nullif(trim(v_allocation ->> 'costCenterName'), ''),
      'General'
    );

    insert into public.cost_centers (name, linked_module, active)
      values (
        v_cost_center,
        coalesce(nullif(v_allocation ->> 'linkedModule', ''), 'General'),
        true
      )
      on conflict (name) do update set active = true;

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
      v_document.id,
      v_line_number,
      coalesce(nullif(trim(v_allocation ->> 'sourceCategory'), ''), 'Otros'),
      coalesce(nullif(trim(v_allocation ->> 'sourceSubcategory'), ''), v_cost_center),
      nullif(trim(coalesce(v_allocation ->> 'detail', '')), ''),
      (v_allocation ->> 'amount')::numeric,
      coalesce(nullif(v_allocation ->> 'linkedModule', ''), 'General'),
      coalesce(nullif(v_allocation ->> 'accountName', ''), 'Otros'),
      v_cost_center,
      nullif(trim(coalesce(v_allocation ->> 'costObjectName', '')), ''),
      'revisado'
    );
  end loop;

  return v_document;
end;
$$;

drop function if exists public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text
);

drop function if exists public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text
);

create function public.finance_cash_expense_update_allocation(
  p_allocation_id uuid,
  p_linked_module text,
  p_account_name text,
  p_cost_center_name text,
  p_cost_object_name text default null
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
    where id = v_allocation.document_id;

  if v_document_status <> 'pendiente' then
    raise exception 'Solo se pueden clasificar comprobantes pendientes.';
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
    account_name = p_account_name,
    cost_center_name = trim(p_cost_center_name),
    cost_object_name = nullif(trim(coalesce(p_cost_object_name, '')), ''),
    mapping_status = 'revisado'
  where id = p_allocation_id
  returning * into v_allocation;

  return v_allocation;
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

revoke all on function public.finance_cash_expense_update_document(
  uuid,
  text,
  text
) from public, anon, authenticated;

revoke all on table public.finance_cashbox_change_log
  from public, anon, authenticated;

revoke all on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.finance_cash_expense_update_document(
  uuid,
  text,
  text
) to service_role;

grant select, insert on table public.finance_cashbox_change_log
  to service_role;

grant execute on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text,
  text
) to service_role;

grant execute on function public.finance_cash_expense_create(
  jsonb,
  jsonb,
  text
) to service_role;

grant execute on function public.finance_cash_expense_transition(
  uuid,
  text
) to service_role;

grant select on public.finance_cashbox_current_balance to service_role;

notify pgrst, 'reload schema';

commit;
