-- 6.1 Recommendation letter tracker: the student's recommenders and, per application, each letter's
-- status and due date. We hold only a recommender's name and relationship (no contact details) and
-- never contact them; the notifier reminds the student to check in before a letter is due.

create table public.recommenders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  relationship text check (length(relationship) <= 120),
  created_at timestamptz not null default now()
);

create table public.recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recommender_id uuid not null references public.recommenders (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  status text not null default 'not_asked' check (status in ('not_asked', 'asked', 'agreed', 'submitted', 'declined')),
  asked_on date,
  due_on date,
  submitted_on date,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recommender_id, application_id)
);
create index recommendation_requests_app_idx on public.recommendation_requests (application_id);
create trigger recommendation_requests_updated_at before update on public.recommendation_requests
  for each row execute function public.set_updated_at();

alter table public.recommenders enable row level security;
alter table public.recommendation_requests enable row level security;
revoke all on public.recommenders, public.recommendation_requests from anon;

create function public.owns_recommender_and_application(p_recommender uuid, p_application uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.recommenders r where r.id = p_recommender and r.user_id = auth.uid())
     and exists (select 1 from public.applications a where a.id = p_application and a.user_id = auth.uid());
$$;
revoke all on function public.owns_recommender_and_application from public, anon;
grant execute on function public.owns_recommender_and_application to authenticated;

create policy "own rows" on public.recommenders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "counselors read shared" on public.recommenders for select to authenticated using (public.counselor_can_see(user_id));

create policy "own rows" on public.recommendation_requests for select to authenticated using (user_id = (select auth.uid()));
create policy "counselors read shared" on public.recommendation_requests for select to authenticated using (public.counselor_can_see(user_id));
create policy "own rows insert" on public.recommendation_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id)
              and public.owns_recommender_and_application(recommender_id, application_id));
create policy "own rows update" on public.recommendation_requests for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_recommender_and_application(recommender_id, application_id));
create policy "own rows delete" on public.recommendation_requests for delete to authenticated using (user_id = (select auth.uid()));

-- Nudges: the notifier reads open requests and logs each reminder once.
create table public.recommendation_reminder_log (
  request_id uuid not null references public.recommendation_requests (id) on delete cascade,
  days_before smallint not null,
  sent_at timestamptz not null default now(),
  primary key (request_id, days_before)
);
alter table public.recommendation_reminder_log enable row level security;
revoke all on public.recommendation_reminder_log from anon, authenticated;
grant select on public.recommenders, public.recommendation_requests to notifier;
grant select, insert on public.recommendation_reminder_log to notifier;
create policy "notifier" on public.recommenders for select to notifier using (true);
create policy "notifier" on public.recommendation_requests for select to notifier using (true);
create policy "notifier" on public.recommendation_reminder_log for all to notifier using (true) with check (true);
