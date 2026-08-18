-- Multi-location stock: locations, localized receipts/production, internal
-- transfers, and a location-aware production availability diagnostic.
--
-- Confirmed by introspection before writing this (see conversation) — NOT
-- guessed:
--   - locations(id, organization_id, code, name, active, created_at) and
--     stock_settings(organization_id, location_tracking_enabled, created_at)
--     already exist, predating this migrations folder. items.default_location_id
--     and stock_movements.location_id already exist too (both nullable, never
--     written by the app). stock_physical already groups by
--     (organization_id, item_id, location_id) — it is NOT modified here.
--   - stock_dashboard/stock_ordered/stock_reserved are untouched: none of them
--     need a location dimension for this feature.
--   - stock_movements_movement_type_check currently allows exactly
--     initial_count/receipt/adjustment/consumption — extended below to add
--     'transfer', never dropping an existing value.
--   - receive_supplier_order_line and complete_production_order bodies below
--     are copied from supabase/migrations/20260817_supplier_orders_fix.sql and
--     20260817_production_orders_shortage.sql (their current live source),
--     with only the location-related lines added/changed.
--
-- Steps 1-6 are purely additive and safe to re-run. Steps 7-11 are
-- create-or-replace of a brand-new view and functions (2 of which replace
-- existing functions using their verified real bodies, not guesses).
--
-- Safe to re-run.

-- 1. locations: add optional note -------------------------------------------

alter table public.locations
  add column if not exists note text;

-- 2. supplier_orders: destination location -----------------------------------

alter table public.supplier_orders
  add column if not exists destination_location_id uuid;

alter table public.supplier_orders
  drop constraint if exists supplier_orders_destination_location_id_fkey;

alter table public.supplier_orders
  add constraint supplier_orders_destination_location_id_fkey
  foreign key (destination_location_id, organization_id)
  references public.locations (id, organization_id);

-- 3. production_orders: production location -----------------------------------

alter table public.production_orders
  add column if not exists location_id uuid;

alter table public.production_orders
  drop constraint if exists production_orders_location_id_fkey;

alter table public.production_orders
  add constraint production_orders_location_id_fkey
  foreign key (location_id, organization_id)
  references public.locations (id, organization_id);

-- 4. stock_transfers ----------------------------------------------------------

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  item_id uuid not null,
  source_location_id uuid not null,
  destination_location_id uuid not null,
  quantity numeric not null check (quantity > 0),
  planned_at date,
  status text not null default 'planned'
    check (status in ('planned', 'in_transit', 'received', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (source_location_id <> destination_location_id)
);

alter table public.stock_transfers
  drop constraint if exists stock_transfers_item_id_fkey;
alter table public.stock_transfers
  add constraint stock_transfers_item_id_fkey
  foreign key (item_id, organization_id)
  references public.items (id, organization_id);

alter table public.stock_transfers
  drop constraint if exists stock_transfers_source_location_id_fkey;
alter table public.stock_transfers
  add constraint stock_transfers_source_location_id_fkey
  foreign key (source_location_id, organization_id)
  references public.locations (id, organization_id);

alter table public.stock_transfers
  drop constraint if exists stock_transfers_destination_location_id_fkey;
alter table public.stock_transfers
  add constraint stock_transfers_destination_location_id_fkey
  foreign key (destination_location_id, organization_id)
  references public.locations (id, organization_id);

alter table public.stock_transfers enable row level security;

drop policy if exists "Members can manage stock transfers" on public.stock_transfers;
create policy "Members can manage stock transfers"
  on public.stock_transfers
  for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- 5. stock_movements: allow 'transfer' movement type ---------------------------
-- Strict superset of the verified current list — initial_count, receipt,
-- adjustment, consumption are all preserved.

alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check;

alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type = any (array[
    'initial_count', 'receipt', 'adjustment', 'consumption', 'transfer'
  ]));

-- 6. Backfill: default "Stock principal" location per org, then fill nulls ----

insert into public.locations (organization_id, code, name)
select o.id, 'PRINCIPAL', 'Stock principal'
from public.organizations o
where not exists (
  select 1 from public.locations l where l.organization_id = o.id
);

update public.items i
set default_location_id = (
  select l.id from public.locations l
  where l.organization_id = i.organization_id
  order by l.created_at asc
  limit 1
)
where i.default_location_id is null;

update public.stock_movements m
set location_id = (
  select l.id from public.locations l
  where l.organization_id = m.organization_id
  order by l.created_at asc
  limit 1
)
where m.location_id is null;

update public.production_orders p
set location_id = (
  select l.id from public.locations l
  where l.organization_id = p.organization_id
  order by l.created_at asc
  limit 1
)
where p.location_id is null;

update public.supplier_orders so
set destination_location_id = (
  select l.id from public.locations l
  where l.organization_id = so.organization_id
  order by l.created_at asc
  limit 1
)
where so.destination_location_id is null
  and so.status in ('ordered', 'partially_received');

-- 7. stock_in_transit: qty gone from its source, not yet received -------------
-- Mirrors the existing stock_ordered/stock_reserved idiom: a derived view over
-- an orders-like table, not speculative stock_movements rows. Only the source
-- side matters — availability, not physical stock, is what "in transit" means.

create or replace view public.stock_in_transit as
select
  organization_id,
  item_id,
  source_location_id as location_id,
  sum(quantity) as quantity_in_transit
from public.stock_transfers
where status = 'in_transit'
group by organization_id, item_id, source_location_id;

alter view public.stock_in_transit set (security_invoker = true);

-- 8. receive_supplier_order_line: now records where the goods landed ----------
-- Adding a 4th parameter changes the function's signature, so
-- CREATE OR REPLACE would NOT replace the existing 3-arg version in place —
-- Postgres identifies functions by (name, parameter types), so a different
-- argument count creates a second overload instead of replacing the first.
-- Drop the old 3-arg signature explicitly first so exactly one version of
-- this function exists afterward.

drop function if exists public.receive_supplier_order_line(uuid, numeric, text);

create or replace function public.receive_supplier_order_line(
  p_line_id uuid,
  p_quantity numeric,
  p_note text default null,
  p_location_id uuid default null
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
  v_location_id uuid;
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

  v_location_id := coalesce(
    p_location_id,
    (select destination_location_id from public.supplier_orders where id = v_line.supplier_order_id)
  );

  insert into public.stock_movements (organization_id, item_id, location_id, movement_type, quantity, note)
  values (v_line.organization_id, v_line.item_id, v_location_id, 'receipt', p_quantity, p_note);

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
    else 'ordered'
  end
  where id = v_line.supplier_order_id;
end;
$$;

-- 9. complete_production_order: consumption/production scoped to the OP's site -
-- Behavior change, not just additive: the shortage check now looks at
-- physical stock AT THE ORDER'S LOCATION only, not the org-wide total —
-- otherwise a production order could silently be allowed to complete (and
-- consume/produce) using stock that physically sits at a different site,
-- which is exactly what "never auto-consume stock from another location"
-- (product brief) forbids.

create or replace function public.complete_production_order(
  p_order_id uuid,
  p_override_reason text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_order public.production_orders%rowtype;
  v_bom record;
  v_shortage boolean := false;
  v_required numeric;
  v_physical numeric;
  v_reserved numeric;
  v_available numeric;
begin
  select * into v_order
  from public.production_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Ordre de production introuvable';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Cet ordre de production est déjà %', v_order.status;
  end if;

  -- First pass: evaluate whether any input would go short, without
  -- writing anything yet.
  for v_bom in
    select component_item_id, quantity_per
    from public.bom_lines
    where product_item_id = v_order.produced_item_id
      and organization_id = v_order.organization_id
  loop
    v_required := v_bom.quantity_per * v_order.quantity_planned;

    v_physical := coalesce((
      select sum(sp.quantity_physical)
      from public.stock_physical sp
      where sp.organization_id = v_order.organization_id
        and sp.item_id = v_bom.component_item_id
        and sp.location_id = v_order.location_id
    ), 0);

    v_reserved := coalesce((
      select sr.quantity_reserved
      from public.stock_reserved sr
      where sr.organization_id = v_order.organization_id
        and sr.item_id = v_bom.component_item_id
    ), 0);

    v_available := v_physical - v_reserved;

    if v_required > v_available then
      v_shortage := true;
    end if;
  end loop;

  if v_shortage and (p_override_reason is null or btrim(p_override_reason) = '') then
    raise exception 'Stock intrant insuffisant — une justification est requise pour forcer la complétion';
  end if;

  -- Second pass: this MVP still allows going negative once a reason is
  -- given (or there was no shortage at all) — same behavior as before,
  -- just no longer silent. Both consumption and production now happen at
  -- the order's own location only.
  for v_bom in
    select component_item_id, quantity_per
    from public.bom_lines
    where product_item_id = v_order.produced_item_id
      and organization_id = v_order.organization_id
  loop
    insert into public.stock_movements (organization_id, item_id, location_id, movement_type, quantity, note)
    values (
      v_order.organization_id,
      v_bom.component_item_id,
      v_order.location_id,
      'consumption',
      -(v_bom.quantity_per * v_order.quantity_planned),
      format('Ordre de production %s', v_order.id)
    );
  end loop;

  insert into public.stock_movements (organization_id, item_id, location_id, movement_type, quantity, note)
  values (
    v_order.organization_id,
    v_order.produced_item_id,
    v_order.location_id,
    'receipt',
    v_order.quantity_planned,
    format('Ordre de production %s', v_order.id)
  );

  update public.production_orders
  set quantity_completed = quantity_planned,
      status = 'completed',
      completed_at = now(),
      completed_with_shortage = v_shortage,
      override_reason = case when v_shortage then p_override_reason else null end
  where id = p_order_id;
end;
$$;

-- 10. depart_stock_transfer: planned -> in_transit, no stock movement ---------

create or replace function public.depart_stock_transfer(p_transfer_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_transfer public.stock_transfers%rowtype;
begin
  select * into v_transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfert introuvable';
  end if;

  if v_transfer.status <> 'planned' then
    raise exception 'Seul un transfert prévu peut passer en transit';
  end if;

  update public.stock_transfers
  set status = 'in_transit'
  where id = p_transfer_id;
end;
$$;

-- 11. receive_stock_transfer: planned|in_transit -> received, writes the -----
-- one matched pair of movements that actually relocates the stock. Net
-- effect on global stock is zero, as required.

create or replace function public.receive_stock_transfer(p_transfer_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_transfer public.stock_transfers%rowtype;
begin
  select * into v_transfer
  from public.stock_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfert introuvable';
  end if;

  if v_transfer.status not in ('planned', 'in_transit') then
    raise exception 'Ce transfert ne peut plus être réceptionné';
  end if;

  insert into public.stock_movements (organization_id, item_id, location_id, movement_type, quantity, note)
  values (
    v_transfer.organization_id,
    v_transfer.item_id,
    v_transfer.source_location_id,
    'transfer',
    -v_transfer.quantity,
    format('Transfert %s', v_transfer.id)
  );

  insert into public.stock_movements (organization_id, item_id, location_id, movement_type, quantity, note)
  values (
    v_transfer.organization_id,
    v_transfer.item_id,
    v_transfer.destination_location_id,
    'transfer',
    v_transfer.quantity,
    format('Transfert %s', v_transfer.id)
  );

  update public.stock_transfers
  set status = 'received'
  where id = p_transfer_id;
end;
$$;

notify pgrst, 'reload schema';
