create table if not exists public.finance_obligations (
  id uuid primary key default gen_random_uuid(),
  obligation_type text not null check (obligation_type in ('pagar', 'cobrar')),
  party_name text not null,
  concept text not null,
  document_number text,
  issue_date date not null,
  due_date date not null,
  original_amount numeric(16, 2) not null check (original_amount > 0),
  currency text not null default 'PYG',
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
  status text not null default 'pendiente'
    check (status in ('pendiente', 'parcial', 'pagado', 'anulado')),
  notes text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= issue_date)
);

create table if not exists public.finance_obligation_settlements (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null
    references public.finance_obligations(id) on delete restrict,
  movement_id uuid not null
    references public.finance_movements(id) on delete restrict,
  settlement_date date not null,
  amount numeric(16, 2) not null check (amount > 0),
  cashbox_name text not null references public.finance_cashboxes(name),
  payment_method text not null,
  reference text,
  notes text,
  status text not null default 'confirmado'
    check (status in ('confirmado', 'anulado')),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists finance_obligations_type_due_idx
  on public.finance_obligations (obligation_type, due_date, status);

create index if not exists finance_obligation_settlements_obligation_idx
  on public.finance_obligation_settlements (
    obligation_id,
    settlement_date desc
  );

alter table public.finance_obligations enable row level security;
alter table public.finance_obligation_settlements enable row level security;

create or replace function public.finance_settle_obligation(
  p_settlement_id uuid,
  p_obligation_id uuid,
  p_settlement_date date,
  p_amount numeric,
  p_cashbox_name text,
  p_payment_method text,
  p_reference text default '',
  p_notes text default '',
  p_created_by_name text default ''
)
returns setof public.finance_obligation_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obligation public.finance_obligations%rowtype;
  v_settlement public.finance_obligation_settlements%rowtype;
  v_paid numeric(16, 2);
  v_balance numeric(16, 2);
  v_movement_id uuid;
begin
  if p_settlement_date is null then
    raise exception 'La fecha no es valida';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe no es valido';
  end if;
  if trim(coalesce(p_cashbox_name, '')) = '' then
    raise exception 'La caja no es valida';
  end if;
  if trim(coalesce(p_payment_method, '')) = '' then
    raise exception 'El medio no es valido';
  end if;

  select *
    into v_obligation
    from public.finance_obligations
    where id = p_obligation_id
    for update;

  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  if v_obligation.status in ('pagado', 'anulado') then
    raise exception 'La cuenta ya esta cerrada';
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.finance_obligation_settlements
    where obligation_id = p_obligation_id
      and status = 'confirmado';

  v_balance := v_obligation.original_amount - v_paid;
  if p_amount > v_balance then
    raise exception 'El importe supera el saldo';
  end if;

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
    p_cashbox_name,
    v_obligation.linked_module,
    v_obligation.account_name,
    v_obligation.cost_center_name,
    case
      when v_obligation.obligation_type = 'pagar' then 'egreso'
      else 'ingreso'
    end,
    p_settlement_date,
    case
      when v_obligation.obligation_type = 'pagar'
        then 'Pago de ' || v_obligation.concept
      else 'Cobro de ' || v_obligation.concept
    end,
    case
      when v_obligation.obligation_type = 'pagar'
        then 'Cuenta por pagar'
      else 'Cuenta por cobrar'
    end,
    p_amount,
    'PYG',
    case
      when v_obligation.obligation_type = 'pagar'
        then 'cuentas_por_pagar'
      else 'cuentas_por_cobrar'
    end,
    'confirmado',
    p_payment_method,
    coalesce(nullif(trim(p_reference), ''), v_obligation.document_number),
    nullif(trim(coalesce(p_created_by_name, '')), ''),
    v_obligation.party_name,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_movement_id;

  insert into public.finance_obligation_settlements (
    id,
    obligation_id,
    movement_id,
    settlement_date,
    amount,
    cashbox_name,
    payment_method,
    reference,
    notes,
    status,
    created_by_name
  )
  values (
    p_settlement_id,
    p_obligation_id,
    v_movement_id,
    p_settlement_date,
    p_amount,
    p_cashbox_name,
    p_payment_method,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'confirmado',
    nullif(trim(coalesce(p_created_by_name, '')), '')
  )
  returning * into v_settlement;

  update public.finance_obligations
    set
      status = case
        when v_paid + p_amount >= original_amount then 'pagado'
        else 'parcial'
      end,
      updated_at = now()
    where id = p_obligation_id;

  return next v_settlement;
end;
$$;

revoke all on function public.finance_settle_obligation(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.finance_settle_obligation(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  text,
  text,
  text
) to service_role;

create or replace function public.finance_void_obligation_settlement(
  p_settlement_id uuid
)
returns setof public.finance_obligation_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.finance_obligation_settlements%rowtype;
  v_obligation public.finance_obligations%rowtype;
  v_paid numeric(16, 2);
begin
  select *
    into v_settlement
    from public.finance_obligation_settlements
    where id = p_settlement_id;

  if not found then
    raise exception 'Aplicacion no encontrada';
  end if;

  select *
    into v_obligation
    from public.finance_obligations
    where id = v_settlement.obligation_id
    for update;

  select *
    into v_settlement
    from public.finance_obligation_settlements
    where id = p_settlement_id
    for update;

  if v_settlement.status = 'anulado' then
    raise exception 'Aplicacion ya anulada';
  end if;

  update public.finance_obligation_settlements
    set status = 'anulado'
    where id = p_settlement_id
    returning * into v_settlement;

  update public.finance_movements
    set status = 'anulado'
    where id = v_settlement.movement_id;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.finance_obligation_settlements
    where obligation_id = v_settlement.obligation_id
      and status = 'confirmado';

  update public.finance_obligations
    set
      status = case
        when v_paid <= 0 then 'pendiente'
        when v_paid >= original_amount then 'pagado'
        else 'parcial'
      end,
      updated_at = now()
    where id = v_settlement.obligation_id;

  return next v_settlement;
end;
$$;

revoke all on function public.finance_void_obligation_settlement(uuid)
  from public, anon, authenticated;

grant execute on function public.finance_void_obligation_settlement(uuid)
  to service_role;

notify pgrst, 'reload schema';
