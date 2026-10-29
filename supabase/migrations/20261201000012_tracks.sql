-- 1.4 Multiple application tracks: a student applying for, say, an MS and an MBA keeps separate
-- targets for each. The profile's own targets stay the default "Main" track, so nothing moves.
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  target_levels public.program_level[] not null check (cardinality(target_levels) >= 1),
  target_countries char(2)[] not null default '{}',
  target_fields text[] not null default '{}',
  budget_amount numeric check (budget_amount > 0),
  budget_currency char(3) check (budget_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  check ((budget_amount is null) = (budget_currency is null))
);
create index tracks_user_idx on public.tracks (user_id, created_at);

alter table public.tracks enable row level security;
revoke all on public.tracks from anon;
create policy "own rows" on public.tracks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

alter table public.applications add column track_id uuid references public.tracks (id) on delete set null;

-- A foreign key does not check ownership, so an application may only point at its owner's track.
create function public.check_application_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.track_id is not null and not exists (
    select 1 from public.tracks t where t.id = new.track_id and t.user_id = new.user_id
  ) then
    raise exception 'That track belongs to someone else' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger applications_track_owner before insert or update of track_id on public.applications
  for each row execute function public.check_application_track();
