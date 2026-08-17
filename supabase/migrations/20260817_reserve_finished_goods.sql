-- Corrective migration: stock_reserved should reserve finished goods
-- directly from customer orders, not explode through the BOM.
--
-- Product decision (2026-08-17): a customer order reserves the finished
-- good itself. It does not consume or reserve BOM inputs — that comes
-- later with production orders, not this module.
--
-- Confirmed current stock_reserved definition explodes bom_lines
-- (reserving component_item_id via a join on product_item_id), which is
-- the wrong behavior per this decision. This migration replaces it with a
-- direct sum over customer_order_lines, keeping the exact same three
-- output columns (organization_id, item_id, quantity_reserved) in the
-- same order, so CREATE OR REPLACE VIEW is safe here (no DROP needed,
-- unlike the earlier stock_dashboard incident where column order changed).
--
-- Does not touch: bom_lines, stock_physical, stock_ordered,
-- stock_dashboard (it already just aggregates stock_reserved by
-- organization_id/item_id, so nothing there needs to change).
--
-- Safe to re-run.

create or replace view public.stock_reserved as
select
  col.organization_id,
  col.product_item_id as item_id,
  sum(col.quantity) as quantity_reserved
from public.customer_order_lines col
join public.customer_orders co
  on co.id = col.customer_order_id and co.organization_id = col.organization_id
where co.status = 'confirmed'
group by col.organization_id, col.product_item_id;

alter view public.stock_reserved set (security_invoker = true);

notify pgrst, 'reload schema';
