-- 4.5 Score sending tracker: which of the student's test scores went to which application, and when
-- the school confirmed receipt. Scores are personal: counselors the student shares with can read
-- these rows, parents cannot (they never see grades or scores).

create table public.score_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  test_score_id uuid not null references public.test_scores (id) on delete cascade,
  sent_on date not null,
  received_on date,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (application_id, test_score_id),
  check (received_on is null or received_on >= sent_on)
);
create index score_reports_app_idx on public.score_reports (application_id);

alter table public.score_reports enable row level security;
revoke all on public.score_reports from anon;

-- The application and the score must both be the student's own.
create function public.owns_application_and_score(p_application uuid, p_score uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications a where a.id = p_application and a.user_id = auth.uid())
     and exists (select 1 from public.test_scores t where t.id = p_score and t.user_id = auth.uid());
$$;
revoke all on function public.owns_application_and_score from public, anon;
grant execute on function public.owns_application_and_score to authenticated;

create policy "own rows" on public.score_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "counselors read shared" on public.score_reports for select to authenticated using (public.counselor_can_see(user_id));
create policy "own rows insert" on public.score_reports for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.can_process_personal_data(user_id)
    and public.owns_application_and_score(application_id, test_score_id)
  );
create policy "own rows update" on public.score_reports for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and public.can_process_personal_data(user_id)
    and public.owns_application_and_score(application_id, test_score_id)
  );
create policy "own rows delete" on public.score_reports for delete to authenticated using (user_id = (select auth.uid()));
