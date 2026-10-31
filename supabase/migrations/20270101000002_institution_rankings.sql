-- QS World University Rankings by Subject, used only to order courses in a student's candidate pool
-- (docs/superpowers/specs/2026-10-30-subject-ranked-candidates-design.md). Rank is a number or a band
-- such as 751-850, kept as rank_low and rank_high. Nothing in the web app selects this table for display.
create table public.institution_rankings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  subject text not null,
  rank_low integer not null,
  rank_high integer not null,
  edition text not null,
  source_id uuid references public.sources (id),
  unique (institution_id, subject, edition),
  check (rank_low >= 1 and rank_high >= rank_low)
);

create index institution_rankings_lookup_idx on public.institution_rankings (institution_id, subject);

alter table public.institution_rankings enable row level security;

-- search_programs runs as the student and needs to read it; the app never shows it.
create policy "public read" on public.institution_rankings for select to anon, authenticated using (true);

grant select, insert, update, delete on public.institution_rankings to ingest_worker;
create policy "worker" on public.institution_rankings for all to ingest_worker using (true) with check (true);
