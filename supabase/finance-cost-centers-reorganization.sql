begin;

alter table public.cost_centers
  add column if not exists code text;

alter table public.cost_centers
  add column if not exists center_type text not null default 'operativo';

create unique index if not exists cost_centers_code_idx
  on public.cost_centers (code)
  where code is not null and code <> '';

update public.cost_centers
set code = null
where name not in (
  'Confinamiento 15 HAS',
  'Confinamiento 500 HAS',
  'Pastoreo Capitan',
  'Pastoreo Villagra',
  'Pastoreo Alonso',
  'Inversiones',
  'Agricola Capiazu',
  'Agricola Brizantha',
  'Administracion'
)
  and code in (
    'GAN-CONF-15',
    'GAN-CONF-500',
    'GAN-PAS-CAP',
    'GAN-PAS-VIL',
    'GAN-PAS-ALO',
    'INV-GRAL',
    'AGR-CAP',
    'AGR-BRI',
    'ADM-GRAL'
  );

insert into public.cost_centers (
  name,
  linked_module,
  code,
  center_type,
  active
)
values
  ('Confinamiento 15 HAS', 'Ganadero', 'GAN-CONF-15', 'ganadero', true),
  ('Confinamiento 500 HAS', 'Ganadero', 'GAN-CONF-500', 'ganadero', true),
  ('Pastoreo Capitan', 'Ganadero', 'GAN-PAS-CAP', 'ganadero', true),
  ('Pastoreo Villagra', 'Ganadero', 'GAN-PAS-VIL', 'ganadero', true),
  ('Pastoreo Alonso', 'Ganadero', 'GAN-PAS-ALO', 'ganadero', true),
  ('Inversiones', 'Financiero', 'INV-GRAL', 'inversion', true),
  ('Agricola Capiazu', 'Agricola', 'AGR-CAP', 'agricola', true),
  ('Agricola Brizantha', 'Agricola', 'AGR-BRI', 'agricola', true),
  ('Administracion', 'Financiero', 'ADM-GRAL', 'administrativo', true)
on conflict (name) do update
set
  linked_module = excluded.linked_module,
  code = excluded.code,
  center_type = excluded.center_type,
  active = true;

create temp table finance_cost_center_map (
  old_name text primary key,
  new_name text not null
) on commit drop;

insert into finance_cost_center_map (old_name, new_name)
values
  ('Administracion CDE', 'Administracion'),
  ('Administracion General', 'Administracion'),
  ('Combustible administrativo', 'Administracion'),
  ('Compras y Logistica', 'Administracion'),
  ('Direccion', 'Administracion'),
  ('Flota Administrativa', 'Administracion'),
  ('Gastos de oficina', 'Administracion'),
  ('General', 'Administracion'),
  ('Honorarios profesionales', 'Administracion'),
  ('Internet y sistemas', 'Administracion'),
  ('Movilidad y gestiones', 'Administracion'),
  ('Otro administrativo', 'Administracion'),
  ('Recursos Humanos', 'Administracion'),
  ('Reparación de vehículo', 'Administracion'),
  ('Servicios básicos', 'Administracion'),
  ('Tesoreria y Contabilidad', 'Administracion'),
  ('Viático', 'Administracion'),
  ('Agricola', 'Agricola Capiazu'),
  ('Capiazu', 'Agricola Capiazu'),
  ('Otro agrícola', 'Agricola Capiazu'),
  ('Brizantha', 'Agricola Brizantha'),
  ('Ganadero Confinamiento', 'Confinamiento 15 HAS'),
  ('Deposito Confinamiento 15 HAS', 'Confinamiento 15 HAS'),
  ('Confinamiento 15 Has', 'Confinamiento 15 HAS'),
  ('Otro ganadero', 'Confinamiento 15 HAS'),
  ('Deposito Confinamiento 500 HAS', 'Confinamiento 500 HAS'),
  ('Confinamiento 500 Has', 'Confinamiento 500 HAS'),
  ('Capitán', 'Pastoreo Capitan'),
  ('Carayao', 'Pastoreo Capitan'),
  ('Deposito Capitan', 'Pastoreo Capitan'),
  ('Ganadero a Pasto', 'Pastoreo Capitan'),
  ('Villagra', 'Pastoreo Villagra'),
  ('Deposito Villagra', 'Pastoreo Villagra'),
  ('Alonso', 'Pastoreo Alonso'),
  ('Construcciones', 'Inversiones'),
  ('Eucalipto', 'Inversiones'),
  ('Infraestructura', 'Inversiones'),
  ('Maquinarias', 'Inversiones'),
  ('Otro inversión', 'Inversiones');

create table if not exists public.finance_cost_center_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  previous_cost_center text not null,
  new_cost_center text not null,
  changed_at timestamptz not null default now(),
  unique (
    entity_type,
    entity_id,
    previous_cost_center,
    new_cost_center
  )
);

insert into public.finance_cost_center_change_log (
  entity_type,
  entity_id,
  previous_cost_center,
  new_cost_center
)
select
  'finance_movements',
  movement.id,
  movement.cost_center_name,
  mapping.new_name
from public.finance_movements movement
join finance_cost_center_map mapping
  on mapping.old_name = movement.cost_center_name
where movement.cost_center_name <> mapping.new_name
on conflict do nothing;

insert into public.finance_cost_center_change_log (
  entity_type,
  entity_id,
  previous_cost_center,
  new_cost_center
)
select
  'finance_cash_expense_allocations',
  allocation.id,
  allocation.cost_center_name,
  mapping.new_name
from public.finance_cash_expense_allocations allocation
join finance_cost_center_map mapping
  on mapping.old_name = allocation.cost_center_name
where allocation.cost_center_name <> mapping.new_name
on conflict do nothing;

insert into public.finance_cost_center_change_log (
  entity_type,
  entity_id,
  previous_cost_center,
  new_cost_center
)
select
  'finance_obligations',
  obligation.id,
  obligation.cost_center_name,
  mapping.new_name
from public.finance_obligations obligation
join finance_cost_center_map mapping
  on mapping.old_name = obligation.cost_center_name
where obligation.cost_center_name <> mapping.new_name
on conflict do nothing;

update public.finance_movements movement
set
  cost_center_name = mapping.new_name,
  linked_module = case
    when mapping.new_name like 'Confinamiento %'
      or mapping.new_name like 'Pastoreo %' then 'Ganadero'
    when mapping.new_name like 'Agricola %' then 'Agricola'
    else 'Financiero'
  end
from finance_cost_center_map mapping
where movement.cost_center_name = mapping.old_name
  and movement.cost_center_name <> mapping.new_name;

update public.finance_cash_expense_allocations allocation
set
  cost_center_name = mapping.new_name,
  linked_module = case
    when mapping.new_name like 'Confinamiento %'
      or mapping.new_name like 'Pastoreo %' then 'Ganadero'
    when mapping.new_name like 'Agricola %' then 'Agricola'
    else 'Financiero'
  end,
  mapping_status = case
    when document.status = 'pendiente' then 'automatico'
    else allocation.mapping_status
  end
from
  finance_cost_center_map mapping,
  public.finance_cash_expenses document
where allocation.cost_center_name = mapping.old_name
  and allocation.document_id = document.id
  and allocation.cost_center_name <> mapping.new_name;

update public.finance_obligations obligation
set
  cost_center_name = mapping.new_name,
  linked_module = case
    when mapping.new_name like 'Confinamiento %'
      or mapping.new_name like 'Pastoreo %' then 'Ganadero'
    when mapping.new_name like 'Agricola %' then 'Agricola'
    else 'Financiero'
  end
from finance_cost_center_map mapping
where obligation.cost_center_name = mapping.old_name
  and obligation.cost_center_name <> mapping.new_name;

update public.cost_centers
set active = false
where name not in (
  'Confinamiento 15 HAS',
  'Confinamiento 500 HAS',
  'Pastoreo Capitan',
  'Pastoreo Villagra',
  'Pastoreo Alonso',
  'Inversiones',
  'Agricola Capiazu',
  'Agricola Brizantha',
  'Administracion'
);

create or replace function public.finance_normalize_cost_center(
  p_name text
)
returns text
language sql
immutable
as $$
  select case
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'confinamiento 15 has',
        'deposito confinamiento 15 has',
        'ganadero confinamiento',
        'otro ganadero'
      ) then 'Confinamiento 15 HAS'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'confinamiento 500 has',
        'deposito confinamiento 500 has'
      ) then 'Confinamiento 500 HAS'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'capitan',
        'carayao',
        'deposito capitan',
        'ganadero a pasto',
        'pastoreo capitan'
      ) then 'Pastoreo Capitan'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in ('deposito villagra', 'pastoreo villagra', 'villagra')
      then 'Pastoreo Villagra'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in ('alonso', 'pastoreo alonso') then 'Pastoreo Alonso'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'agricola',
        'agricola capiazu',
        'capiazu',
        'otro agricola'
      ) then 'Agricola Capiazu'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in ('agricola brizantha', 'brizantha') then 'Agricola Brizantha'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'construcciones',
        'eucalipto',
        'infraestructura',
        'inversiones',
        'maquinarias',
        'otro inversion'
      ) then 'Inversiones'
    when translate(lower(trim(coalesce(p_name, ''))), 'áéíóúñ', 'aeioun')
      in (
        'administracion',
        'administracion cde',
        'administracion general',
        'combustible administrativo',
        'compras y logistica',
        'direccion',
        'flota administrativa',
        'gastos de oficina',
        'general',
        'honorarios profesionales',
        'internet y sistemas',
        'movilidad y gestiones',
        'otro administrativo',
        'recursos humanos',
        'reparacion de vehiculo',
        'servicios basicos',
        'tesoreria y contabilidad',
        'viatico'
      ) then 'Administracion'
    else null
  end;
$$;

create or replace function public.finance_cost_center_module(
  p_name text
)
returns text
language sql
immutable
as $$
  select case
    when p_name like 'Confinamiento %' or p_name like 'Pastoreo %'
      then 'Ganadero'
    when p_name like 'Agricola %' then 'Agricola'
    else 'Financiero'
  end;
$$;

create or replace function public.finance_enforce_cost_center_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  if not new.active then
    return new;
  end if;

  v_name := public.finance_normalize_cost_center(new.name);
  if v_name is null then
    raise exception
      'El centro de costo "%" no pertenece al catalogo operativo.',
      new.name;
  end if;

  new.name := v_name;
  new.linked_module := public.finance_cost_center_module(v_name);
  new.code := case v_name
    when 'Confinamiento 15 HAS' then 'GAN-CONF-15'
    when 'Confinamiento 500 HAS' then 'GAN-CONF-500'
    when 'Pastoreo Capitan' then 'GAN-PAS-CAP'
    when 'Pastoreo Villagra' then 'GAN-PAS-VIL'
    when 'Pastoreo Alonso' then 'GAN-PAS-ALO'
    when 'Inversiones' then 'INV-GRAL'
    when 'Agricola Capiazu' then 'AGR-CAP'
    when 'Agricola Brizantha' then 'AGR-BRI'
    else 'ADM-GRAL'
  end;
  new.center_type := case
    when v_name like 'Confinamiento %' or v_name like 'Pastoreo %'
      then 'ganadero'
    when v_name like 'Agricola %' then 'agricola'
    when v_name = 'Inversiones' then 'inversion'
    else 'administrativo'
  end;
  return new;
end;
$$;

create or replace function public.finance_enforce_operational_cost_center()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := public.finance_normalize_cost_center(new.cost_center_name);
  if v_name is null then
    raise exception
      'Seleccione uno de los nueve centros de costo operativos.';
  end if;

  new.cost_center_name := v_name;
  new.linked_module := public.finance_cost_center_module(v_name);
  return new;
end;
$$;

drop trigger if exists finance_cost_centers_catalog_guard
  on public.cost_centers;

create trigger finance_cost_centers_catalog_guard
before insert or update on public.cost_centers
for each row
execute function public.finance_enforce_cost_center_catalog();

drop trigger if exists finance_movements_cost_center_guard
  on public.finance_movements;

create trigger finance_movements_cost_center_guard
before insert or update of cost_center_name on public.finance_movements
for each row
execute function public.finance_enforce_operational_cost_center();

drop trigger if exists finance_allocations_cost_center_guard
  on public.finance_cash_expense_allocations;

create trigger finance_allocations_cost_center_guard
before insert or update of cost_center_name
on public.finance_cash_expense_allocations
for each row
execute function public.finance_enforce_operational_cost_center();

drop trigger if exists finance_obligations_cost_center_guard
  on public.finance_obligations;

create trigger finance_obligations_cost_center_guard
before insert or update of cost_center_name on public.finance_obligations
for each row
execute function public.finance_enforce_operational_cost_center();

grant select on table public.finance_cost_center_change_log
  to service_role;

notify pgrst, 'reload schema';

commit;

select
  center.name,
  center.code,
  center.linked_module,
  center.center_type,
  (
    select count(*)
    from public.finance_movements movement
    where movement.cost_center_name = center.name
  ) as movements,
  (
    select count(*)
    from public.finance_cash_expense_allocations allocation
    where allocation.cost_center_name = center.name
  ) as allocations,
  (
    select count(*)
    from public.finance_obligations obligation
    where obligation.cost_center_name = center.name
  ) as obligations
from public.cost_centers center
where center.active = true
order by center.code;
