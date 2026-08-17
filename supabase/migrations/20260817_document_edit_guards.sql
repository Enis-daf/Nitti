-- Guards a document-editing feature relies on: allow editing
-- supplier_order_lines.quantity_ordered from the UI (for lines not yet
-- received), while making it impossible — at the DB level, not just in
-- the client — to drop it below what's already been received.
--
-- Purely additive: one new CHECK constraint on a table whose full schema
-- was already verified earlier this session (see project memory). No
-- existing constraint, view, or table definition touched.
--
-- Safe to re-run.

alter table public.supplier_order_lines
  drop constraint if exists supplier_order_lines_received_le_ordered_check;

alter table public.supplier_order_lines
  add constraint supplier_order_lines_received_le_ordered_check
  check (quantity_received <= quantity_ordered);

notify pgrst, 'reload schema';
