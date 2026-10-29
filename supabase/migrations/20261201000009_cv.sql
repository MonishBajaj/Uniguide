-- 6.2 CV builder: the student's own entries, laid out for printing. The app suggests what to add
-- (numbers, actions) but never rewrites a line. Counselors the student shares with can read it;
-- parents cannot.

create table public.cv_headers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  headline text check (length(headline) <= 160),
  contact_line text check (length(contact_line) <= 240),   -- as the student wants it printed
  updated_at timestamptz not null default now()
);

create table public.cv_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section text not null check (section in ('education', 'experience', 'projects', 'awards', 'skills', 'other')),
  title text not null check (length(btrim(title)) between 1 and 160),
  organisation text check (length(organisation) <= 160),
  location text check (length(location) <= 120),
  start_month date check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),   -- null with a start month means "present"
  bullets text[] not null default '{}' check (cardinality(bullets) <= 8 and length(array_to_string(bullets, '')) <= 2400),
  created_at timestamptz not null default now(),
  check (end_month is null or start_month is null or end_month >= start_month)
);
create index cv_entries_user_idx on public.cv_entries (user_id, section, start_month desc);

alter table public.cv_headers enable row level security;
alter table public.cv_entries enable row level security;
revoke all on public.cv_headers, public.cv_entries from anon;

create policy "own rows" on public.cv_headers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "counselors read shared" on public.cv_headers for select to authenticated using (public.counselor_can_see(user_id));
create policy "own rows" on public.cv_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "counselors read shared" on public.cv_entries for select to authenticated using (public.counselor_can_see(user_id));
