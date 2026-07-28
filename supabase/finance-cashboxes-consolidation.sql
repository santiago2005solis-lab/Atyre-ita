-- Consolida el sistema financiero en tres cajas operativas.
-- Caja Oviedo se conserva como Caja Particular; las demas cajas antiguas
-- se consolidan en Caja Central. Caja CDE permanece sin cambios.

begin;

insert into public.finance_cashboxes (name, active)
values
  ('Caja Central', true),
  ('Caja CDE', true),
  ('Caja Particular', true)
on conflict (name) do update set active = true;

update public.finance_cash_expenses
set
  notes = case
    when status = 'pendiente' then concat_ws(
      ' | ',
      nullif(trim(coalesce(notes, '')), ''),
      'Caja original importada: ' || cashbox_name
    )
    else notes
  end,
  cashbox_name = case
    when cashbox_name = 'Caja CDE' then 'Caja CDE'
    when lower(cashbox_name) like '%oviedo%'
      or lower(cashbox_name) like '%particular%'
      then 'Caja Particular'
    else 'Caja Central'
  end,
  cashbox_reviewed = case
    when status = 'pendiente' then false
    else true
  end,
  updated_at = now()
where cashbox_name not in ('Caja Central', 'Caja CDE', 'Caja Particular');

update public.finance_movements
set cashbox_name = case
  when cashbox_name = 'Caja CDE' then 'Caja CDE'
  when lower(cashbox_name) like '%oviedo%'
    or lower(cashbox_name) like '%particular%'
    then 'Caja Particular'
  else 'Caja Central'
end
where cashbox_name not in ('Caja Central', 'Caja CDE', 'Caja Particular');

update public.finance_obligation_settlements
set cashbox_name = case
  when cashbox_name = 'Caja CDE' then 'Caja CDE'
  when lower(cashbox_name) like '%oviedo%'
    or lower(cashbox_name) like '%particular%'
    then 'Caja Particular'
  else 'Caja Central'
end
where cashbox_name not in ('Caja Central', 'Caja CDE', 'Caja Particular');

update public.finance_imported_commerce
set cashbox_name = case
  when cashbox_name = 'Caja CDE' then 'Caja CDE'
  when lower(cashbox_name) like '%oviedo%'
    or lower(cashbox_name) like '%particular%'
    then 'Caja Particular'
  else 'Caja Central'
end
where cashbox_name is not null
  and cashbox_name not in ('Caja Central', 'Caja CDE', 'Caja Particular');

update public.finance_cashboxes
set active = name in ('Caja Central', 'Caja CDE', 'Caja Particular');

create or replace function public.finance_require_operational_cashbox()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cashbox_name not in (
    'Caja Central',
    'Caja CDE',
    'Caja Particular'
  ) then
    raise exception 'La caja % no pertenece al catalogo operativo.', new.cashbox_name;
  end if;
  return new;
end;
$$;

create or replace function public.finance_require_active_cashbox_catalog()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active
    and new.name not in ('Caja Central', 'Caja CDE', 'Caja Particular') then
    raise exception 'Solo Caja Central, Caja CDE y Caja Particular pueden estar activas.';
  end if;
  return new;
end;
$$;

drop trigger if exists finance_cashboxes_operational_guard
  on public.finance_cashboxes;
create trigger finance_cashboxes_operational_guard
before insert or update of name, active
on public.finance_cashboxes
for each row execute function public.finance_require_active_cashbox_catalog();

drop trigger if exists finance_movements_cashbox_guard
  on public.finance_movements;
create trigger finance_movements_cashbox_guard
before insert or update of cashbox_name
on public.finance_movements
for each row execute function public.finance_require_operational_cashbox();

drop trigger if exists finance_cash_expenses_cashbox_guard
  on public.finance_cash_expenses;
create trigger finance_cash_expenses_cashbox_guard
before insert or update of cashbox_name
on public.finance_cash_expenses
for each row execute function public.finance_require_operational_cashbox();

drop trigger if exists finance_obligation_settlements_cashbox_guard
  on public.finance_obligation_settlements;
create trigger finance_obligation_settlements_cashbox_guard
before insert or update of cashbox_name
on public.finance_obligation_settlements
for each row execute function public.finance_require_operational_cashbox();

notify pgrst, 'reload schema';

commit;
