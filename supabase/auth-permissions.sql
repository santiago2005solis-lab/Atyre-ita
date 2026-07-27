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

alter table app_users enable row level security;
alter table app_module_permissions enable row level security;

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
