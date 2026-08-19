-- Per-location stock minimums, so a low-stock alert is judged at
-- (reference × lieu) instead of only against items.low_stock_threshold
-- summed/ignored across all locations.
--
-- Confirmed by introspection before writing this (not guessed):
--   - items.low_stock_threshold already exists (numeric, not null, default 0)
--     and is the only threshold today — it is a single global value per item,
--     with no location dimension. It is NOT dropped or renamed here: it keeps
--     working as the fallback default for any (item, location) pair that has
--     no explicit override, so existing alert behavior for orgs that never
--     set a per-location minimum is unchanged.
--   - No existing table stores a per-location minimum. This migration adds
--     exactly one new table for it, following the same composite-FK and RLS
--     idiom as every other org-scoped table in this schema (see
--     stock_transfers in 20260818_stock_locations.sql for the same pattern).
--   - stock_dashboard, stock_physical, and computeLocationAlerts' rupture
--     check (physical < 0) are untouched — only the "low stock" comparison's
--     threshold source changes, in application code, not in this migration.
--
-- Purely additive. Safe to re-run.

create table if not exists public.item_location_thresholds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  item_id uuid not null,
  location_id uuid not null,
  minimum_stock numeric not null default 0 check (minimum_stock >= 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, item_id, location_id)
);

alter table public.item_location_thresholds
  drop constraint if exists item_location_thresholds_item_id_fkey;
alter table public.item_location_thresholds
  add constraint item_location_thresholds_item_id_fkey
  foreign key (item_id, organization_id)
  references public.items (id, organization_id);

alter table public.item_location_thresholds
  drop constraint if exists item_location_thresholds_location_id_fkey;
alter table public.item_location_thresholds
  add constraint item_location_thresholds_location_id_fkey
  foreign key (location_id, organization_id)
  references public.locations (id, organization_id);

alter table public.item_location_thresholds enable row level security;

drop policy if exists "Members can manage item location thresholds" on public.item_location_thresholds;
create policy "Members can manage item location thresholds"
  on public.item_location_thresholds
  for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

notify pgrst, 'reload schema';
