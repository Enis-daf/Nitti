-- Adds shortage-override tracking to production orders, and makes the
-- completion RPC enforce it server-side (not just a client-side UI gate).
--
-- Purely additive on a table this session created itself
-- (production_orders, see 20260817_production_orders.sql) — no
-- introspection needed, no existing constraint/view touched. Depends on
-- stock_physical and stock_reserved (both pre-existing, already verified
-- earlier this session) to compute "available" the same way
-- stock_dashboard already does, but does not modify either view.
--
-- Run 20260817_production_orders.sql first if it hasn't been applied yet.
--
-- Safe to re-run.

alter table public.production_orders
  add column if not exists override_reason text,
  add column if not exists completed_with_shortage boolean not null default false;

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
  -- just no longer silent.
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
      completed_at = now(),
      completed_with_shortage = v_shortage,
      override_reason = case when v_shortage then p_override_reason else null end
  where id = p_order_id;
end;
$$;

notify pgrst, 'reload schema';
