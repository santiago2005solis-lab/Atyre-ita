begin;

alter table public.app_module_permissions
  drop constraint if exists app_module_permissions_module_name_check;

alter table public.app_module_permissions
  add constraint app_module_permissions_module_name_check
  check (
    module_name in (
      'ganadero',
      'agricola',
      'maquinarias',
      'rrhh',
      'financiero',
      'deposito',
      'cierres',
      'usuarios'
    )
  );

create table if not exists public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  status text not null default 'abierto'
    check (status in ('abierto', 'revision', 'aprobado', 'cerrado')),
  notes text,
  next_month_pending text,
  finance_snapshot jsonb not null default '{}'::jsonb,
  created_by_name text,
  approved_by_name text,
  closed_by_name text,
  submitted_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start = date_trunc('month', period_start)::date)
);

create table if not exists public.monthly_closing_items (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null
    references public.monthly_closings(id) on delete cascade,
  report_number integer not null check (report_number between 1 and 14),
  report_key text not null,
  title text not null,
  source_module text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'preparado', 'revisado', 'aprobado')),
  responsible_name text,
  notes text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (closing_id, report_key),
  unique (closing_id, report_number)
);

create index if not exists monthly_closings_period_status_idx
  on public.monthly_closings (period_start desc, status);

create index if not exists monthly_closing_items_status_idx
  on public.monthly_closing_items (closing_id, status, report_number);

alter table public.monthly_closings enable row level security;
alter table public.monthly_closing_items enable row level security;

create or replace function public.monthly_closing_create(
  p_period_start date,
  p_created_by_name text
)
returns setof public.monthly_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing public.monthly_closings%rowtype;
begin
  if p_period_start is null or
    p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'Periodo mensual no valido';
  end if;

  insert into public.monthly_closings (
    period_start,
    status,
    created_by_name
  )
  values (
    p_period_start,
    'abierto',
    nullif(trim(coalesce(p_created_by_name, '')), '')
  )
  on conflict (period_start) do update
    set period_start = excluded.period_start
  returning * into v_closing;

  insert into public.monthly_closing_items (
    closing_id,
    report_number,
    report_key,
    title,
    source_module
  )
  values
    (v_closing.id, 1, 'resumen_general', 'Resumen general', 'Cierres'),
    (v_closing.id, 2, 'ingresos_ventas_sector', 'Ingresos y ventas por sector', 'Financiero'),
    (v_closing.id, 3, 'gastos_sector', 'Gastos por sector', 'Financiero'),
    (v_closing.id, 4, 'caja_bancos', 'Caja y bancos', 'Financiero'),
    (v_closing.id, 5, 'cuentas_cobrar', 'Cuentas por cobrar', 'Financiero'),
    (v_closing.id, 6, 'cuentas_pagar', 'Cuentas por pagar', 'Financiero'),
    (v_closing.id, 7, 'inventario', 'Inventario', 'Deposito'),
    (v_closing.id, 8, 'hato_ganadero', 'Hato ganadero', 'Ganadero'),
    (v_closing.id, 9, 'productivo_ganadero', 'Productividad ganadera', 'Ganadero'),
    (v_closing.id, 10, 'combustible_maquinarias', 'Combustible y maquinarias', 'Maquinarias'),
    (v_closing.id, 11, 'personal_salarios', 'Personal y salarios', 'Recursos Humanos'),
    (v_closing.id, 12, 'obras_inversiones', 'Obras e inversiones', 'Obras y Trabajos'),
    (v_closing.id, 13, 'trabajos_realizados', 'Trabajos realizados', 'Obras y Trabajos'),
    (v_closing.id, 14, 'indicadores_mensuales', 'Indicadores mensuales', 'Cierres')
  on conflict (closing_id, report_key) do nothing;

  return next v_closing;
end;
$$;

create or replace function public.monthly_closing_transition(
  p_closing_id uuid,
  p_target_status text,
  p_user_name text,
  p_finance_snapshot jsonb
)
returns setof public.monthly_closings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing public.monthly_closings%rowtype;
  v_incomplete integer;
begin
  if p_target_status not in ('abierto', 'revision', 'aprobado', 'cerrado') then
    raise exception 'Estado de cierre no valido';
  end if;

  select *
    into v_closing
    from public.monthly_closings
    where id = p_closing_id
    for update;

  if not found then
    raise exception 'Cierre no encontrado';
  end if;

  if p_target_status = v_closing.status then
    return next v_closing;
    return;
  end if;

  if p_target_status = 'revision' then
    if v_closing.status <> 'abierto' then
      raise exception 'El cierre no esta abierto';
    end if;
    select count(*)
      into v_incomplete
      from public.monthly_closing_items
      where closing_id = p_closing_id
        and status = 'pendiente';
    if v_incomplete > 0 then
      raise exception 'Existen reportes pendientes';
    end if;
  elsif p_target_status = 'aprobado' then
    if v_closing.status <> 'revision' then
      raise exception 'El cierre no esta en revision';
    end if;
    select count(*)
      into v_incomplete
      from public.monthly_closing_items
      where closing_id = p_closing_id
        and status <> 'aprobado';
    if v_incomplete > 0 then
      raise exception 'Existen reportes sin aprobar';
    end if;
  elsif p_target_status = 'cerrado' then
    if v_closing.status <> 'aprobado' then
      raise exception 'El cierre debe estar aprobado';
    end if;
  elsif p_target_status = 'abierto' then
    if v_closing.status not in ('revision', 'aprobado', 'cerrado') then
      raise exception 'El cierre no puede reabrirse';
    end if;
    if v_closing.status in ('aprobado', 'cerrado') then
      update public.monthly_closing_items
        set
          status = case
            when status = 'aprobado' then 'revisado'
            else status
          end,
          updated_by_name = nullif(trim(coalesce(p_user_name, '')), ''),
          updated_at = now()
        where closing_id = p_closing_id;
    end if;
  end if;

  update public.monthly_closings
    set
      status = p_target_status,
      submitted_at = case
        when p_target_status = 'revision' then now()
        when p_target_status = 'abierto' then null
        else submitted_at
      end,
      approved_at = case
        when p_target_status = 'aprobado' then now()
        when p_target_status = 'abierto' then null
        else approved_at
      end,
      approved_by_name = case
        when p_target_status = 'aprobado'
          then nullif(trim(coalesce(p_user_name, '')), '')
        when p_target_status = 'abierto' then null
        else approved_by_name
      end,
      closed_at = case
        when p_target_status = 'cerrado' then now()
        when p_target_status = 'abierto' then null
        else closed_at
      end,
      closed_by_name = case
        when p_target_status = 'cerrado'
          then nullif(trim(coalesce(p_user_name, '')), '')
        when p_target_status = 'abierto' then null
        else closed_by_name
      end,
      finance_snapshot = case
        when p_target_status = 'cerrado'
          then coalesce(p_finance_snapshot, '{}'::jsonb)
        when p_target_status = 'abierto'
          then '{}'::jsonb
        else finance_snapshot
      end,
      updated_at = now()
    where id = p_closing_id
    returning * into v_closing;

  return next v_closing;
end;
$$;

revoke all on function public.monthly_closing_create(date, text)
  from public, anon, authenticated;
revoke all on function public.monthly_closing_transition(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.monthly_closing_create(date, text)
  to service_role;
grant execute on function public.monthly_closing_transition(uuid, text, text, jsonb)
  to service_role;

insert into public.app_module_permissions (
  user_id,
  module_name,
  access_role
)
select
  app_users.id,
  'cierres',
  'desarrollador'
from public.app_users
where role = 'desarrollador'
on conflict (user_id, module_name) do update set
  access_role = excluded.access_role,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
