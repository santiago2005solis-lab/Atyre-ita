begin;

create table if not exists public.finance_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  fingerprint text not null unique,
  expense_count integer not null default 0,
  allocation_count integer not null default 0,
  commerce_count integer not null default 0,
  total_amount numeric(18, 2) not null default 0,
  imported_by_name text,
  source_balances jsonb not null default '{}'::jsonb,
  source_catalogs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.finance_import_batches
  add column if not exists source_balances jsonb not null default '{}'::jsonb;

alter table public.finance_import_batches
  add column if not exists source_catalogs jsonb not null default '{}'::jsonb;

create table if not exists public.finance_cash_expenses (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  import_batch_id uuid references public.finance_import_batches(id) on delete restrict,
  document_date date not null,
  document_number text,
  supplier text,
  responsible text,
  payment_method text,
  cashbox_name text not null references public.finance_cashboxes(name),
  description text not null,
  notes text,
  total_amount numeric(18, 2) not null check (total_amount > 0),
  source text not null default 'manual',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'confirmado', 'anulado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_cash_expenses_legacy_idx
  on public.finance_cash_expenses (source, legacy_id)
  where legacy_id is not null and legacy_id <> '';

create index if not exists finance_cash_expenses_date_status_idx
  on public.finance_cash_expenses (document_date desc, status);

create index if not exists finance_cash_expenses_cashbox_date_idx
  on public.finance_cash_expenses (cashbox_name, document_date desc);

create table if not exists public.finance_cash_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.finance_cash_expenses(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  source_category text not null,
  source_subcategory text not null,
  detail text,
  amount numeric(18, 2) not null check (amount > 0),
  linked_module text not null check (
    linked_module in (
      'Ganadero',
      'Agricola',
      'Maquinarias',
      'Recursos Humanos',
      'Financiero',
      'Deposito',
      'General'
    )
  ),
  account_name text not null references public.finance_accounts(name),
  cost_center_name text not null references public.cost_centers(name),
  mapping_status text not null default 'automatico'
    check (mapping_status in ('automatico', 'revisado')),
  movement_id uuid references public.finance_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_id, line_number)
);

create index if not exists finance_cash_allocations_document_idx
  on public.finance_cash_expense_allocations (document_id, line_number);

create index if not exists finance_cash_allocations_classification_idx
  on public.finance_cash_expense_allocations (
    linked_module,
    account_name,
    cost_center_name
  );

create table if not exists public.finance_imported_commerce (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.finance_import_batches(id) on delete restrict,
  legacy_id text,
  document_date date not null,
  due_date date,
  source_type text not null,
  source_category text,
  client_name text,
  supplier_name text,
  amount numeric(18, 2) not null check (amount >= 0),
  paid_amount numeric(18, 2) not null default 0 check (paid_amount >= 0),
  source_status text not null,
  payment_method text,
  cashbox_name text,
  document_number text,
  detail text,
  notes text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'conciliado', 'omitido')),
  obligation_id uuid references public.finance_obligations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (import_batch_id, legacy_id)
);

create index if not exists finance_imported_commerce_status_idx
  on public.finance_imported_commerce (status, document_date desc);

alter table public.finance_import_batches enable row level security;
alter table public.finance_cash_expenses enable row level security;
alter table public.finance_cash_expense_allocations enable row level security;
alter table public.finance_imported_commerce enable row level security;

create or replace function public.finance_import_legacy_cash_backup(
  p_payload jsonb,
  p_file_name text,
  p_fingerprint text,
  p_imported_by_name text default null
)
returns public.finance_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation jsonb;
  v_allocation_count integer := 0;
  v_amount numeric(18, 2);
  v_batch public.finance_import_batches;
  v_cashbox text;
  v_catalog_group text;
  v_catalog_item jsonb;
  v_catalog_values jsonb;
  v_commerce jsonb;
  v_commerce_count integer := 0;
  v_cost_center text;
  v_document public.finance_cash_expenses;
  v_expense jsonb;
  v_expense_count integer := 0;
  v_expense_total numeric(18, 2);
  v_line_number integer;
  v_linked_module text;
  v_source_category text;
  v_source_subcategory text;
  v_total_amount numeric(18, 2) := 0;
begin
  if jsonb_typeof(coalesce(p_payload -> 'expenses', 'null'::jsonb)) <> 'array' then
    raise exception 'El respaldo no contiene una lista valida de gastos.';
  end if;

  if trim(coalesce(p_fingerprint, '')) = '' then
    raise exception 'No se recibio la huella del archivo.';
  end if;

  insert into public.finance_import_batches (
    file_name,
    fingerprint,
    imported_by_name,
    source_balances,
    source_catalogs
  )
  values (
    coalesce(nullif(trim(p_file_name), ''), 'respaldo.json'),
    trim(p_fingerprint),
    nullif(trim(coalesce(p_imported_by_name, '')), ''),
    coalesce(p_payload -> 'balances', '{}'::jsonb),
    coalesce(p_payload -> 'tables', '{}'::jsonb)
  )
  returning * into v_batch;

  if jsonb_typeof(coalesce(p_payload #> '{tables,cashboxes}', '[]'::jsonb)) = 'array' then
    for v_catalog_item in
      select value
      from jsonb_array_elements(
        coalesce(p_payload #> '{tables,cashboxes}', '[]'::jsonb)
      )
    loop
      v_cashbox := nullif(trim(v_catalog_item #>> '{}'), '');
      if v_cashbox is not null then
        insert into public.finance_cashboxes (name, active)
          values (v_cashbox, true)
          on conflict (name) do update set active = true;
      end if;
    end loop;
  end if;

  if jsonb_typeof(coalesce(p_payload #> '{tables,subcategories}', '{}'::jsonb)) = 'object' then
    for v_catalog_group, v_catalog_values in
      select key, value
      from jsonb_each(
        coalesce(p_payload #> '{tables,subcategories}', '{}'::jsonb)
      )
    loop
      if jsonb_typeof(v_catalog_values) = 'array' then
        for v_catalog_item in
          select value from jsonb_array_elements(v_catalog_values)
        loop
          v_cost_center := nullif(trim(v_catalog_item #>> '{}'), '');
          if v_cost_center is not null then
            v_linked_module := case lower(v_catalog_group)
              when 'ganadero' then 'Ganadero'
              when 'agrícola' then 'Agricola'
              when 'agricola' then 'Agricola'
              when 'inversión' then
                case
                  when lower(v_cost_center) = 'maquinarias' then 'Maquinarias'
                  else 'Financiero'
                end
              when 'inversion' then
                case
                  when lower(v_cost_center) = 'maquinarias' then 'Maquinarias'
                  else 'Financiero'
                end
              when 'administrativo' then 'General'
              else 'General'
            end;

            insert into public.cost_centers (name, linked_module, active)
              values (v_cost_center, v_linked_module, true)
              on conflict (name) do update set active = true;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  for v_expense in
    select value from jsonb_array_elements(p_payload -> 'expenses')
  loop
    if coalesce(v_expense ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Un gasto contiene una fecha invalida.';
    end if;

    if jsonb_typeof(coalesce(v_expense -> 'allocations', 'null'::jsonb)) <> 'array'
      or jsonb_array_length(v_expense -> 'allocations') = 0 then
      raise exception 'El gasto % no contiene distribuciones.',
        coalesce(v_expense ->> 'comprobante', v_expense ->> 'id', 'sin identificador');
    end if;

    select coalesce(sum((value ->> 'monto')::numeric), 0)
      into v_expense_total
      from jsonb_array_elements(v_expense -> 'allocations');

    if v_expense_total <= 0 then
      raise exception 'El gasto % no tiene un monto valido.',
        coalesce(v_expense ->> 'comprobante', v_expense ->> 'id', 'sin identificador');
    end if;

    v_cashbox := coalesce(
      nullif(trim(v_expense ->> 'cajaOrigen'), ''),
      'Caja sin clasificar'
    );

    insert into public.finance_cashboxes (name, active)
      values (v_cashbox, true)
      on conflict (name) do update set active = true;

    insert into public.finance_cash_expenses (
      legacy_id,
      import_batch_id,
      document_date,
      document_number,
      supplier,
      responsible,
      payment_method,
      cashbox_name,
      description,
      notes,
      total_amount,
      source,
      status,
      created_at
    )
    values (
      nullif(trim(coalesce(v_expense ->> 'id', '')), ''),
      v_batch.id,
      (v_expense ->> 'fecha')::date,
      nullif(trim(coalesce(v_expense ->> 'comprobante', '')), ''),
      nullif(trim(coalesce(v_expense ->> 'proveedor', '')), ''),
      nullif(trim(coalesce(v_expense ->> 'responsable', '')), ''),
      nullif(trim(coalesce(v_expense ->> 'formaPago', '')), ''),
      v_cashbox,
      coalesce(
        nullif(trim(v_expense ->> 'descripcion'), ''),
        'Gasto importado'
      ),
      nullif(trim(coalesce(v_expense ->> 'observacion', '')), ''),
      v_expense_total,
      'respaldo_gastos_caja',
      'pendiente',
      coalesce(
        nullif(v_expense ->> 'createdAt', '')::timestamptz,
        now()
      )
    )
    returning * into v_document;

    v_line_number := 0;
    for v_allocation in
      select value from jsonb_array_elements(v_expense -> 'allocations')
    loop
      v_line_number := v_line_number + 1;
      v_source_category := coalesce(
        nullif(trim(v_allocation ->> 'category'), ''),
        'Sin categoria'
      );
      v_source_subcategory := coalesce(
        nullif(trim(v_allocation ->> 'subcategory'), ''),
        'General'
      );
      v_amount := coalesce((v_allocation ->> 'monto')::numeric, 0);

      if v_amount <= 0 then
        raise exception 'Una distribucion del gasto % no tiene monto valido.',
          coalesce(v_expense ->> 'comprobante', v_document.id::text);
      end if;

      v_linked_module := case lower(v_source_category)
        when 'ganadero' then 'Ganadero'
        when 'agrícola' then 'Agricola'
        when 'agricola' then 'Agricola'
        when 'inversión' then
          case
            when lower(v_source_subcategory) = 'maquinarias' then 'Maquinarias'
            else 'Financiero'
          end
        when 'inversion' then
          case
            when lower(v_source_subcategory) = 'maquinarias' then 'Maquinarias'
            else 'Financiero'
          end
        when 'administrativo' then 'General'
        else 'General'
      end;
      v_cost_center := v_source_subcategory;

      insert into public.cost_centers (name, linked_module, active)
        values (v_cost_center, v_linked_module, true)
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
        mapping_status
      )
      values (
        v_document.id,
        v_line_number,
        v_source_category,
        v_source_subcategory,
        nullif(trim(coalesce(v_allocation ->> 'detail', '')), ''),
        v_amount,
        v_linked_module,
        case
          when lower(v_source_category) in ('inversión', 'inversion')
            then 'Inversiones'
          else 'Otros'
        end,
        v_cost_center,
        'automatico'
      );

      v_allocation_count := v_allocation_count + 1;
    end loop;

    v_expense_count := v_expense_count + 1;
    v_total_amount := v_total_amount + v_expense_total;
  end loop;

  if jsonb_typeof(coalesce(p_payload -> 'commerceRecords', '[]'::jsonb)) = 'array' then
    for v_commerce in
      select value from jsonb_array_elements(
        coalesce(p_payload -> 'commerceRecords', '[]'::jsonb)
      )
    loop
      if coalesce(v_commerce ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Una operacion comercial contiene una fecha invalida.';
      end if;

      v_cashbox := nullif(trim(coalesce(v_commerce ->> 'cashbox', '')), '');
      if v_cashbox is not null then
        insert into public.finance_cashboxes (name, active)
          values (v_cashbox, true)
          on conflict (name) do update set active = true;
      end if;

      insert into public.finance_imported_commerce (
        import_batch_id,
        legacy_id,
        document_date,
        due_date,
        source_type,
        source_category,
        client_name,
        supplier_name,
        amount,
        paid_amount,
        source_status,
        payment_method,
        cashbox_name,
        document_number,
        detail,
        notes,
        created_at
      )
      values (
        v_batch.id,
        nullif(trim(coalesce(v_commerce ->> 'id', '')), ''),
        (v_commerce ->> 'date')::date,
        case
          when coalesce(v_commerce ->> 'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (v_commerce ->> 'dueDate')::date
          else null
        end,
        coalesce(nullif(trim(v_commerce ->> 'type'), ''), 'Sin tipo'),
        nullif(trim(coalesce(v_commerce ->> 'category', '')), ''),
        nullif(trim(coalesce(v_commerce ->> 'client', '')), ''),
        nullif(trim(coalesce(v_commerce ->> 'supplier', '')), ''),
        greatest(coalesce((v_commerce ->> 'amount')::numeric, 0), 0),
        greatest(coalesce((v_commerce ->> 'paidAmount')::numeric, 0), 0),
        coalesce(nullif(trim(v_commerce ->> 'status'), ''), 'Sin estado'),
        nullif(trim(coalesce(v_commerce ->> 'paymentMethod', '')), ''),
        v_cashbox,
        nullif(trim(coalesce(v_commerce ->> 'document', '')), ''),
        nullif(trim(coalesce(v_commerce ->> 'detail', '')), ''),
        nullif(trim(coalesce(v_commerce ->> 'observation', '')), ''),
        case
          when coalesce(v_commerce ->> 'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
            then (v_commerce ->> 'createdAt')::timestamptz
          else now()
        end
      );

      v_commerce_count := v_commerce_count + 1;
    end loop;
  end if;

  update public.finance_import_batches
  set
    expense_count = v_expense_count,
    allocation_count = v_allocation_count,
    commerce_count = v_commerce_count,
    total_amount = v_total_amount
  where id = v_batch.id
  returning * into v_batch;

  return v_batch;
exception
  when unique_violation then
    raise exception 'Este respaldo ya fue importado anteriormente.';
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

  for v_allocation in select value from jsonb_array_elements(p_allocations)
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
      'revisado'
    );
  end loop;

  return v_document;
end;
$$;

create or replace function public.finance_cash_expense_update_allocation(
  p_allocation_id uuid,
  p_linked_module text,
  p_account_name text,
  p_cost_center_name text
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
  select a, d.status
    into v_allocation, v_document_status
    from public.finance_cash_expense_allocations a
    join public.finance_cash_expenses d on d.id = a.document_id
    where a.id = p_allocation_id
    for update;

  if v_allocation.id is null then
    raise exception 'Distribucion no encontrada.';
  end if;
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
  v_allocation public.finance_cash_expense_allocations;
  v_document public.finance_cash_expenses;
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
    if exists (
      select 1
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
        and mapping_status <> 'revisado'
    ) then
      raise exception 'Revise la clasificacion de todas las distribuciones.';
    end if;

    for v_allocation in
      select *
      from public.finance_cash_expense_allocations
      where document_id = v_document.id
      order by line_number
      for update
    loop
      insert into public.finance_movements (
        cashbox_name,
        linked_module,
        account_name,
        cost_center_name,
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
        v_allocation.linked_module,
        v_allocation.account_name,
        v_allocation.cost_center_name,
        'egreso',
        v_document.document_date,
        concat_ws(
          ' - ',
          v_document.description,
          nullif(v_allocation.detail, '')
        ),
        v_allocation.source_category,
        v_allocation.amount,
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
      where id = v_allocation.id;
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

create or replace function public.finance_cash_expense_review_document(
  p_document_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_updated integer;
begin
  select status
    into v_status
    from public.finance_cash_expenses
    where id = p_document_id
    for update;

  if v_status is null then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_status <> 'pendiente' then
    raise exception 'Solo se pueden revisar comprobantes pendientes.';
  end if;

  update public.finance_cash_expense_allocations
  set mapping_status = 'revisado'
  where document_id = p_document_id
    and mapping_status <> 'revisado';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on table public.finance_import_batches from anon, authenticated;
revoke all on table public.finance_cash_expenses from anon, authenticated;
revoke all on table public.finance_cash_expense_allocations from anon, authenticated;
revoke all on table public.finance_imported_commerce from anon, authenticated;

revoke all on function public.finance_import_legacy_cash_backup(
  jsonb,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.finance_cash_expense_create(
  jsonb,
  jsonb,
  text
) from public, anon, authenticated;
revoke all on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.finance_cash_expense_transition(
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.finance_cash_expense_review_document(
  uuid
) from public, anon, authenticated;

grant select, insert, update, delete on table public.finance_import_batches
  to service_role;
grant select, insert, update, delete on table public.finance_cash_expenses
  to service_role;
grant select, insert, update, delete on table public.finance_cash_expense_allocations
  to service_role;
grant select, insert, update, delete on table public.finance_imported_commerce
  to service_role;

grant execute on function public.finance_import_legacy_cash_backup(
  jsonb,
  text,
  text,
  text
) to service_role;
grant execute on function public.finance_cash_expense_create(
  jsonb,
  jsonb,
  text
) to service_role;
grant execute on function public.finance_cash_expense_update_allocation(
  uuid,
  text,
  text,
  text
) to service_role;
grant execute on function public.finance_cash_expense_transition(
  uuid,
  text
) to service_role;
grant execute on function public.finance_cash_expense_review_document(
  uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
