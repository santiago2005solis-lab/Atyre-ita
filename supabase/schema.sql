create extension if not exists pgcrypto;

create table if not exists finance_cashboxes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists finance_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_type text not null check (
    account_type in ('ingreso', 'egreso', 'transferencia', 'inversion', 'otro')
  ),
  linked_module text not null default 'General' check (
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
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  linked_module text not null default 'General' check (
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
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists finance_movements (
  id uuid primary key default gen_random_uuid(),
  cashbox_name text not null references finance_cashboxes(name),
  linked_module text not null default 'General' check (
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
  account_name text not null default 'Otros' references finance_accounts(name),
  cost_center_name text not null default 'General' references cost_centers(name),
  movement_type text not null check (movement_type in ('ingreso', 'egreso', 'transferencia')),
  movement_date date not null,
  concept text not null,
  category text not null,
  amount numeric(16, 2) not null check (amount > 0),
  currency text not null default 'PYG',
  source_module text not null default 'manual',
  status text not null default 'borrador' check (
    status in ('borrador', 'pendiente', 'confirmado', 'anulado')
  ),
  payment_method text,
  document_number text,
  responsible text,
  related_party text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists finance_movements_cashbox_date_idx
  on finance_movements (cashbox_name, movement_date desc);

create index if not exists finance_movements_type_date_idx
  on finance_movements (movement_type, movement_date desc);

create index if not exists finance_movements_module_date_idx
  on finance_movements (linked_module, movement_date desc);

create index if not exists finance_movements_account_date_idx
  on finance_movements (account_name, movement_date desc);

create index if not exists finance_movements_cost_center_date_idx
  on finance_movements (cost_center_name, movement_date desc);

create table if not exists inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_name text not null references inventory_warehouses(name),
  sku text not null,
  name text not null,
  category text not null,
  unit text not null,
  current_stock numeric(16, 3) not null default 0,
  min_stock numeric(16, 3) not null default 0,
  unit_cost numeric(16, 2) not null default 0,
  supplier text,
  updated_at timestamptz not null default now(),
  unique (warehouse_name, sku)
);

create index if not exists inventory_items_warehouse_idx
  on inventory_items (warehouse_name, name);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  warehouse_name text not null references inventory_warehouses(name),
  target_warehouse_name text references inventory_warehouses(name),
  movement_type text not null check (movement_type in ('entrada', 'salida', 'traslado', 'ajuste')),
  movement_date date not null,
  quantity numeric(16, 3) not null check (quantity > 0),
  unit_cost numeric(16, 2) not null default 0,
  document_number text,
  responsible text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_date_idx
  on inventory_movements (item_id, movement_date desc);

create table if not exists hr_employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  document_number text,
  role text,
  department text,
  status text not null default 'activo' check (status in ('activo', 'licencia', 'inactivo')),
  start_date date,
  salary_type text not null default 'mensual' check (salary_type in ('mensual', 'jornal')),
  monthly_salary numeric(16, 2) not null default 0,
  daily_wage numeric(16, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('desarrollador', 'administrador', 'editor', 'lector')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_module_permissions (
  user_id uuid not null references app_users(id) on delete cascade,
  module_name text not null check (
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
  ),
  access_role text not null check (
    access_role in ('sin_acceso', 'lector', 'editor', 'administrador', 'desarrollador')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, module_name)
);

create or replace view finance_cashbox_report as
select
  cashbox_name,
  date_trunc('month', movement_date)::date as month,
  sum(case when movement_type = 'ingreso' then amount else 0 end) as income,
  sum(case when movement_type = 'egreso' then amount else 0 end) as expense,
  sum(case when movement_type = 'transferencia' then amount else 0 end) as transfers,
  sum(case when movement_type = 'ingreso' then amount when movement_type = 'egreso' then -amount else 0 end) as balance
from finance_movements
where status = 'confirmado'
group by cashbox_name, date_trunc('month', movement_date)::date;

create or replace view inventory_stock_report as
select
  warehouse_name,
  count(*) as item_count,
  sum(current_stock * unit_cost) as stock_value,
  sum(case when current_stock <= min_stock then 1 else 0 end) as low_stock_count
from inventory_items
group by warehouse_name;

alter table finance_cashboxes enable row level security;
alter table finance_accounts enable row level security;
alter table cost_centers enable row level security;
alter table finance_movements enable row level security;
alter table inventory_warehouses enable row level security;
alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;
alter table hr_employees enable row level security;
alter table app_users enable row level security;
alter table app_module_permissions enable row level security;

insert into finance_cashboxes (name) values
  ('Caja Central'),
  ('Caja CDE'),
  ('Caja Particular')
on conflict (name) do nothing;

insert into finance_accounts (name, account_type, linked_module) values
  ('Venta de ganado', 'ingreso', 'Ganadero'),
  ('Venta agricola', 'ingreso', 'Agricola'),
  ('Servicios y alquileres', 'ingreso', 'Maquinarias'),
  ('Compra de ganado', 'egreso', 'Ganadero'),
  ('Alimento animal', 'egreso', 'Ganadero'),
  ('Sanidad animal', 'egreso', 'Ganadero'),
  ('Insumos agricolas', 'egreso', 'Agricola'),
  ('Combustible', 'egreso', 'Maquinarias'),
  ('Mantenimiento de maquinarias', 'egreso', 'Maquinarias'),
  ('Repuestos', 'egreso', 'Maquinarias'),
  ('Sueldos y jornales', 'egreso', 'Recursos Humanos'),
  ('Deposito e inventario', 'egreso', 'Deposito'),
  ('Servicios generales', 'egreso', 'General'),
  ('Transferencias internas', 'transferencia', 'Financiero'),
  ('Inversiones', 'inversion', 'Financiero'),
  ('Otros', 'otro', 'General')
on conflict (name) do nothing;

insert into cost_centers (name, linked_module) values
  ('Confinamiento 15 HAS', 'Ganadero'),
  ('Confinamiento 500 HAS', 'Ganadero'),
  ('Pastoreo Capitan', 'Ganadero'),
  ('Pastoreo Villagra', 'Ganadero'),
  ('Pastoreo Alonso', 'Ganadero'),
  ('Inversiones', 'Financiero'),
  ('Agricola Capiazu', 'Agricola'),
  ('Agricola Brizantha', 'Agricola'),
  ('Administracion', 'Financiero')
on conflict (name) do nothing;

insert into inventory_warehouses (name) values
  ('Deposito Capitan'),
  ('Deposito Villagra'),
  ('Deposito Confinamiento 15 HAS'),
  ('Confinamiento 500 HAS')
on conflict (name) do nothing;

insert into inventory_items
  (warehouse_name, sku, name, category, unit, current_stock, min_stock, unit_cost, supplier)
values
  ('Deposito Capitan', 'ALM-001', 'Balanceado terminacion', 'Alimento', 'kg', 18450, 8000, 3100, 'Nutricion Campo'),
  ('Deposito Villagra', 'VET-014', 'Antiparasitario bovino', 'Veterinaria', 'litro', 64, 30, 125000, 'Veterinaria Norte'),
  ('Deposito Confinamiento 15 HAS', 'REP-022', 'Filtro hidraulico', 'Repuestos', 'unidad', 11, 8, 185000, 'Mecanica Diesel'),
  ('Confinamiento 500 HAS', 'AGR-102', 'Fertilizante granulado', 'Agricola', 'bolsa', 420, 150, 168000, 'Agroinsumos Central')
on conflict (warehouse_name, sku) do nothing;

insert into finance_movements
  (
    cashbox_name,
    linked_module,
    account_name,
    cost_center_name,
    movement_type,
    movement_date,
    concept,
    category,
    amount,
    payment_method,
    document_number,
    responsible,
    related_party,
    notes
  )
select
  'Caja Central', 'Ganadero', 'Venta de ganado', 'Confinamiento 15 HAS',
  'ingreso', date '2026-07-21', 'Venta de novillos terminados', 'Venta', 328400000,
  'Transferencia bancaria', 'FV-00128', 'Administracion', 'Frigorifico regional', 'Operacion de cierre semanal'
where not exists (select 1 from finance_movements where document_number = 'FV-00128');

insert into finance_movements
  (
    cashbox_name,
    linked_module,
    account_name,
    cost_center_name,
    movement_type,
    movement_date,
    concept,
    category,
    amount,
    payment_method,
    document_number,
    responsible,
    related_party,
    notes
  )
select
  'Caja Central', 'Ganadero', 'Alimento animal', 'Confinamiento 15 HAS',
  'egreso', date '2026-07-20', 'Compra de balanceado terminacion', 'Alimento', 68400000,
  'Transferencia bancaria', 'FC-00451', 'Compras', 'Nutricion Campo', 'Reposicion mensual'
where not exists (select 1 from finance_movements where document_number = 'FC-00451');

insert into finance_movements
  (
    cashbox_name,
    linked_module,
    account_name,
    cost_center_name,
    movement_type,
    movement_date,
    concept,
    category,
    amount,
    payment_method,
    document_number,
    responsible,
    related_party,
    notes
  )
select
  'Caja Central', 'Agricola', 'Insumos agricolas', 'Agricola Capiazu',
  'egreso', date '2026-07-17', 'Semillas y fertilizante', 'Agricola', 95800000,
  'Cheque', 'FC-00439', 'Compras', 'Agroinsumos Central', 'Campana de invierno'
where not exists (select 1 from finance_movements where document_number = 'FC-00439');

insert into hr_employees
  (full_name, document_number, role, department, status, start_date, monthly_salary, notes)
select
  'Carlos Benitez', '1234567', 'Encargado de campo', 'Ganaderia', 'activo', date '2024-02-15', 5200000,
  'Responsable de recorridas y novedades'
where not exists (select 1 from hr_employees where document_number = '1234567');

insert into hr_employees
  (full_name, document_number, role, department, status, start_date, monthly_salary, notes)
select
  'Maria Duarte', '2345678', 'Auxiliar administrativo', 'Administracion', 'activo', date '2025-03-01', 4300000,
  'Control documental y archivo'
where not exists (select 1 from hr_employees where document_number = '2345678');

insert into app_users (id, email, full_name, role, active)
select
  id,
  lower(email),
  'Desarrollo Sistema',
  'desarrollador',
  true
from auth.users
where lower(email) = 'desarrollosistema@aty.com'
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  active = excluded.active,
  updated_at = now();

insert into app_module_permissions (user_id, module_name, access_role)
select
  app_users.id,
  modules.module_name,
  'desarrollador'
from app_users
cross join (
  values
    ('ganadero'),
    ('agricola'),
    ('maquinarias'),
    ('rrhh'),
    ('financiero'),
    ('deposito'),
    ('cierres'),
    ('usuarios')
) as modules(module_name)
where lower(app_users.email) = 'desarrollosistema@aty.com'
on conflict (user_id, module_name) do update set
  access_role = excluded.access_role,
  updated_at = now();
