-- Corrective migration for the supplier-orders module, written after full
-- introspection of the live schema (see 20260817_supplier_orders.sql for
-- what went wrong and why this file exists).
--
-- Confirmed by introspection — NOT changed here because they're already
-- correct:
--   - suppliers / supplier_orders / supplier_order_lines: structure,
--     composite (id, organization_id) foreign keys, the
--     draft/ordered/partially_received/received/cancelled status check,
--     and expected_at (not expected_date) are all already correct.
--   - stock_movements.movement_type CHECK already allows initial_count,
--     receipt, adjustment, consumption.
--   - stock_physical / stock_ordered / stock_reserved / stock_dashboard
--     view definitions are already correct.
--   - The "Members can manage X" policies (using is_org_member()) already
--     grant full org-scoped access to suppliers, supplier_orders,
--     supplier_order_lines, and stock_movements.
--
-- What this migration actually does:
--   1. Drops the 7 redundant policies left behind by the superseded
--      migration. They duplicated "Members can manage X" with a different
--      role scope (public instead of authenticated) and a separately
--      maintained expression instead of is_org_member() — not a security
--      hole (auth.uid() is null for anon, so the subquery matches nothing),
--      but redundant and a drift risk if is_org_member() ever changes.
--   2. Creates the receive_supplier_order_line RPC — genuinely new
--      functionality needed for the receiving UI, not previously present.
--      In the branch where an order still has unreceived, unstarted lines,
--      it sets status to 'ordered' (the schema's default status and a
--      valid value), never 'open' (not a valid value; the superseded
--      migration's version of this function had that bug).
--   3. Sets security_invoker = true on the 4 stock views, per the
--      validated convention. This only changes view metadata, not their
--      query definitions.
--
-- Safe to re-run.

-- 1. Drop redundant policies from the superseded migration ------------------

drop policy if exists "suppliers_select" on public.suppliers;
drop policy if exists "suppliers_insert" on public.suppliers;
drop policy if exists "supplier_orders_select" on public.supplier_orders;
drop policy if exists "supplier_orders_insert" on public.supplier_orders;
drop policy if exists "supplier_orders_update" on public.supplier_orders;
drop policy if exists "supplier_order_lines_select" on public.supplier_order_lines;
drop policy if exists "supplier_order_lines_insert" on public.supplier_order_lines;

-- 2. Receipt RPC ------------------------------------------------------------
-- security invoker: runs as the calling user, so "Members can manage X"
-- RLS policies apply as normal.

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
    else 'ordered'
  end
  where id = v_line.supplier_order_id;
end;
$$;

-- 3. security_invoker on the stock views -------------------------------

alter view public.stock_physical set (security_invoker = true);
alter view public.stock_ordered set (security_invoker = true);
alter view public.stock_reserved set (security_invoker = true);
alter view public.stock_dashboard set (security_invoker = true);

notify pgrst, 'reload schema';
