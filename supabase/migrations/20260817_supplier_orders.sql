-- Supplier orders module: suppliers, supplier orders, supplier order lines,
-- a receipt RPC, and an updated stock_dashboard view.
--
-- Assumptions made because this migration was written without visibility into
-- the live schema (organization-scoped RLS via organization_members.user_id,
-- stock_movements.movement_type enforced by a CHECK constraint, physical
-- stock = sum of stock_movements.quantity for 'initial_count'/'adjustment'/
-- 'receipt'). Review the stock_dashboard view below before running — if your
-- current view computes alert_status or quantity_reserved differently, adjust
-- to match before executing in the Supabase SQL editor.
--
-- Safe to re-run: uses if not exists / or replace / drop-then-create guards.

-- 1. Suppliers ----------------------------------------------------------

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.suppliers enable row level security;

drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers
  for select using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists "suppliers_insert" on public.suppliers;
create policy "suppliers_insert" on public.suppliers
  for insert with check (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- 2. Supplier orders ------------------------------------------------------

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid references public.suppliers(id),
  order_number text,
  expected_date date,
  status text not null default 'open'
    check (status in ('open', 'partially_received', 'received')),
  created_at timestamptz not null default now()
);

alter table public.supplier_orders enable row level security;

drop policy if exists "supplier_orders_select" on public.supplier_orders;
create policy "supplier_orders_select" on public.supplier_orders
  for select using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists "supplier_orders_insert" on public.supplier_orders;
create policy "supplier_orders_insert" on public.supplier_orders
  for insert with check (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists "supplier_orders_update" on public.supplier_orders;
create policy "supplier_orders_update" on public.supplier_orders
  for update using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  ) with check (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- 3. Supplier order lines --------------------------------------------------
-- organization_id is denormalized here (rather than joined through
-- supplier_orders) to keep RLS simple and to let the receipt RPC insert a
-- stock_movement without an extra lookup.

create table if not exists public.supplier_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_order_id uuid not null references public.supplier_orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity_ordered numeric not null check (quantity_ordered > 0),
  quantity_received numeric not null default 0 check (quantity_received >= 0),
  created_at timestamptz not null default now()
);

alter table public.supplier_order_lines enable row level security;

drop policy if exists "supplier_order_lines_select" on public.supplier_order_lines;
create policy "supplier_order_lines_select" on public.supplier_order_lines
  for select using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

drop policy if exists "supplier_order_lines_insert" on public.supplier_order_lines;
create policy "supplier_order_lines_insert" on public.supplier_order_lines
  for insert with check (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- 4. Allow 'receipt' as a stock_movements.movement_type ---------------------
-- Drops any existing CHECK constraint on this column (regardless of name)
-- and recreates it with 'receipt' added, so this is safe to re-run and does
-- not depend on guessing the constraint's original name.

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute attr
      on attr.attrelid = rel.oid and attr.attnum = any(con.conkey)
    where rel.relname = 'stock_movements'
      and attr.attname = 'movement_type'
      and con.contype = 'c'
  loop
    execute format('alter table public.stock_movements drop constraint %I', constraint_record.conname);
  end loop;
end $$;

alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type in ('initial_count', 'adjustment', 'receipt'));

-- If movement_type turns out to be a native Postgres enum type instead of a
-- text column with a CHECK constraint, the block above is a no-op and this
-- ALTER TABLE will fail. In that case run instead (replace <enum_type_name>):
--   alter type <enum_type_name> add value if not exists 'receipt';

-- 5. Receipt RPC ------------------------------------------------------------
-- Wraps the three writes (quantity_received, stock_movement, order status)
-- in one transactional function, as requested. security invoker: runs as the
-- calling user, so the RLS policies above still apply.

create or replace function public.receive_supplier_order_line(
  p_line_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_line public.supplier_order_lines%rowtype;
  v_new_received numeric;
  v_open_lines int;
  v_started_lines int;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité reçue doit être positive';
  end if;

  select * into v_line
  from public.supplier_order_lines
  where id = p_line_id
  for update;

  if not found then
    raise exception 'Ligne de commande introuvable';
  end if;

  v_new_received := v_line.quantity_received + p_quantity;
  if v_new_received > v_line.quantity_ordered then
    raise exception 'La quantité reçue dépasse la quantité commandée';
  end if;

  update public.supplier_order_lines
  set quantity_received = v_new_received
  where id = p_line_id;

  insert into public.stock_movements (organization_id, item_id, movement_type, quantity, note)
  values (v_line.organization_id, v_line.item_id, 'receipt', p_quantity, p_note);

  select
    count(*) filter (where quantity_received < quantity_ordered),
    count(*) filter (where quantity_received > 0)
  into v_open_lines, v_started_lines
  from public.supplier_order_lines
  where supplier_order_id = v_line.supplier_order_id;

  update public.supplier_orders
  set status = case
    when v_open_lines = 0 then 'received'
    when v_started_lines > 0 then 'partially_received'
    else 'open'
  end
  where id = v_line.supplier_order_id;
end;
$$;

-- 6. stock_dashboard view -----------------------------------------------
-- Recreated in full so quantity_ordered reflects open supplier order lines.
-- quantity_reserved has no source table yet (no customer-order module
-- exists), so it stays 0 until that module lands.

create or replace view public.stock_dashboard as
with physical as (
  select item_id, coalesce(sum(quantity), 0) as quantity_physical
  from public.stock_movements
  where movement_type in ('initial_count', 'adjustment', 'receipt')
  group by item_id
),
ordered as (
  select sol.item_id, coalesce(sum(sol.quantity_ordered - sol.quantity_received), 0) as quantity_ordered
  from public.supplier_order_lines sol
  join public.supplier_orders so on so.id = sol.supplier_order_id
  where so.status <> 'received'
  group by sol.item_id
)
select
  i.id as item_id,
  i.organization_id,
  i.sku,
  i.name,
  i.item_type,
  i.low_stock_threshold,
  coalesce(p.quantity_physical, 0) as quantity_physical,
  coalesce(o.quantity_ordered, 0) as quantity_ordered,
  0 as quantity_reserved,
  coalesce(p.quantity_physical, 0) - 0 as quantity_available,
  case
    when coalesce(p.quantity_physical, 0) <= 0 and coalesce(o.quantity_ordered, 0) <= 0
      then 'missing_physical_and_ordered_stock'
    when coalesce(p.quantity_physical, 0) <= 0
      then 'missing_physical_stock'
    when coalesce(p.quantity_physical, 0) < i.low_stock_threshold
      then 'low_physical_stock'
    else 'ok'
  end as alert_status
from public.items i
left join physical p on p.item_id = i.id
left join ordered o on o.item_id = i.id
where i.active;

notify pgrst, 'reload schema';
