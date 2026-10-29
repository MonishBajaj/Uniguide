-- Suppressed trend insights published by the analyst role from consented outcomes. No row identifies anyone:
-- a group needs at least ten outcomes.
create table public.public_insights (
  id uuid primary key default gen_random_uuid(),
  metric text not null,
  dimension jsonb not null,
  value numeric not null,
  group_size integer not null check (group_size >= 10),
  computed_at timestamptz not null default now()
);
alter table public.public_insights enable row level security;
create policy "public read" on public.public_insights for select to anon, authenticated using (true);
create policy "analyst" on public.public_insights for all to analyst using (true) with check (true);
revoke all on public.public_insights from anon, authenticated;
grant select on public.public_insights to anon, authenticated;
grant select, insert, delete on public.public_insights to analyst;
