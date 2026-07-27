alter table app_module_permissions
  drop constraint if exists app_module_permissions_module_name_check;

delete from app_module_permissions old_permissions
using app_module_permissions new_permissions
where old_permissions.user_id = new_permissions.user_id
  and old_permissions.module_name = 'finanzas'
  and new_permissions.module_name = 'financiero';

update app_module_permissions
set module_name = 'financiero',
    updated_at = now()
where module_name = 'finanzas';

alter table app_module_permissions
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
