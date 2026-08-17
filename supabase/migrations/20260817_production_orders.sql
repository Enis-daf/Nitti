-- Production orders module.
--
-- Confirmed by the full public table listing done earlier this session
-- that no production-related table already exists — this is pure
-- creation, not a modification of anything unknown.
--
-- The one existing object this migration depends on is
-- stock_movements.movement_type, confirmed earlier this session to allow
-- initial_count / receipt / adjustment / consumption. NOT touched here:
-- production stock-in uses the existing 'receipt' value (no new value
-- introduced, per instruction), and consumption uses the existing
-- 'consumption' value with negative quantities (matching the convention
-- stock_physical already relies on).
--
-- No production_order_consumptions table: "planned" consumption is
-- quantity_planned x bom_lines, computed on the fly rather than stored
-- per order; "actual" consumption is the stock_movements rows the
-- completion RPC creates (tagged in their note with the order id for
-- traceability). A separate tracking table would duplicate this for no
-- MVP benefit.
--
-- Safe to re-run.

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  produced_item_id uuid not null,
  quantity_planned numeric not null check (quantity_planned > 0),
  quantity_completed numeric not null default 0 check (quantity_completed >= 0),
  status text not null default 'planned'
    check (status in ('draft', 'planned', 'completed', 'cancelled')),
  planned_at date,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  foreign key (produced_item_id, organization_id) references public.items(id, organization_id)
);

alter table public.production_orders enable row level security;

drop policy if exists "Members can manage production orders" on public.production_orders;
create policy "Members can manage production orders" on public.production_orders
  for all
  to authenticated
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

-- Completion RPC --------------------------------------------------------
-- security invoker: runs as the calling user, so the policy above applies
-- normally — a user who isn't a member of the order's organization simply
-- won't find the row, which satisfies "belongs to the user's organization"
-- without a separate explicit check (same idiom as
-- receive_supplier_order_line).
--
-- This MVP completes the full quantity_planned in one action (no partial
-- completion, unlike supplier receipts) — matches the "Produire 2 BeWe"
-- example: the whole planned quantity is produced and consumed at once.

create or replace function public.complete_production_order(p_order_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_order public.production_orders%rowtype;
  v_bom record;
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

  for v_bom in
    select component_item_id, quantity_per
    from public.bom_lines
    where product_item_id = v_order.produced_item_id
      and organization_id = v_order.organization_id
  loop
    insert into public.stock_movements (organization_id, item_id, movement_type, quantity, note)
    values (
      v_order.organization_id,
      v_bom.component_item_id,
      'consumption',
      -(v_bom.quantity_per * v_order.quantity_planned),
      format('Ordre de production %s', v_order.id)
    );
  end loop;

  insert into public.stock_movements (organization_id, item_id, movement_type, quantity, note)
  values (
    v_order.organization_id,
    v_order.produced_item_id,
    'receipt',
    v_order.quantity_planned,
    format('Ordre de production %s', v_order.id)
  );

  update public.production_orders
  set quantity_completed = quantity_planned,
      status = 'completed',
      completed_at = now()
  where id = p_order_id;
end;
$$;

notify pgrst, 'reload schema';
