-- Weeks 5-6: tracker, checklists, reminders, notifications, outcomes, source register,
-- outdated-info reports and the notifier role.

create type public.decision as enum ('admitted', 'rejected', 'waitlisted', 'withdrawn', 'deferred');
create type public.notification_kind as enum ('fact_changed', 'reminder', 'report_resolved', 'agency');
create type public.source_kind as enum ('course', 'admissions', 'requirements', 'international', 'fees', 'deadlines');
alter type public.consent_kind add value if not exists 'agency_sharing';

create function public.has_consent(p_uid uuid, p_kind public.consent_kind) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c
    where c.user_id = p_uid and c.kind = p_kind and c.withdrawn_at is null
  );
$$;

-- Profile: reminder preferences and research interests (for the faculty matcher).
alter table public.profiles
  add column reminders_enabled boolean not null default true,
  add column reminder_days smallint[] not null default '{30,7,1}',
  add column research_interests text check (length(research_interests) <= 2000);
grant update (reminders_enabled, reminder_days, research_interests) on public.profiles to authenticated;

-- Tracker: an application card per shortlisted course, with the student's own decision data.
alter table public.applications
  add column notes text check (length(notes) <= 4000),
  add column decision public.decision,
  add column awarded_aid numeric check (awarded_aid >= 0),
  add column awarded_aid_currency char(3) check (awarded_aid_currency ~ '^[A-Z]{3}$'),
  add column deposit_due_at timestamptz,
  add column decided_at date;

alter table public.checklist_items
  add column kind text not null default 'custom' check (kind in ('requirement', 'system_step', 'deadline', 'custom')),
  add column sort smallint not null default 0,
  add column details text,
  add column link text check (link ~ '^https?://'),
  add column deadline_id uuid references public.deadlines (id) on delete set null,
  add column done_at timestamptz;
create index checklist_items_app_idx on public.checklist_items (application_id, sort);

-- Reminders: one row per email sent, so a reminder is never sent twice.
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  due_at timestamptz not null,
  days_before smallint not null,
  sent_at timestamptz not null default now(),
  unique (application_id, due_at, days_before)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  program_id uuid references public.programs (id) on delete cascade,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Outcomes shared for research, with their own revocable consent. Separate from the decision a
-- student records on their tracker card, which is theirs alone.
create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  decision public.decision not null,
  funding_offered boolean,
  funding_amount numeric check (funding_amount >= 0),
  funding_currency char(3) check (funding_currency ~ '^[A-Z]{3}$'),
  decided_at date,
  verification_level text not null default 'self_reported' check (verification_level in ('self_reported', 'document_seen')),
  -- Snapshot of the inputs a model may learn from (grade on its own scale, scores), taken when shared.
  profile_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index outcomes_program_idx on public.outcomes (program_id);

-- Source register: the official pages to read for each course.
create table public.program_sources (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  kind public.source_kind not null,
  url text not null check (url ~ '^https?://'),
  rights_note text,
  etag text,
  last_modified text,
  content_hash text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (program_id, url)
);

-- "Report outdated information". Accepted reports earn credits.
create table public.fact_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  subject public.fact_subject,
  fact_id uuid,
  message text not null check (length(message) between 5 and 2000),
  evidence_url text check (evidence_url ~ '^https?://'),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Credits: balance is the sum of the ledger. Rows are written only by the functions below.
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('report_accepted', 'admin_grant', 'season_pass', 'writing_review', 'draft_comparison', 'refund')),
  ref uuid,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id);


-- RLS -------------------------------------------------------------------------------
alter table public.reminder_log enable row level security;
alter table public.notifications enable row level security;
alter table public.outcomes enable row level security;
alter table public.program_sources enable row level security;
alter table public.fact_reports enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on public.reminder_log, public.notifications, public.outcomes, public.fact_reports, public.credit_ledger from anon;
revoke insert, update, delete on public.reminder_log, public.credit_ledger, public.program_sources from authenticated;

create policy "own rows" on public.reminder_log for select to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "mark read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "own rows" on public.outcomes for select to authenticated using (user_id = (select auth.uid()));
create policy "share with consent" on public.outcomes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_process_personal_data(user_id)
    and public.has_consent(user_id, 'outcomes_research')
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );
create policy "withdraw" on public.outcomes for delete to authenticated using (user_id = (select auth.uid()));

create policy "public read" on public.program_sources for select to anon, authenticated using (true);
create policy "admins manage" on public.program_sources for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant insert, update, delete on public.program_sources to authenticated;

create policy "own reports" on public.fact_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "file a report" on public.fact_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and resolved_by is null);
revoke update, delete on public.fact_reports from authenticated;

create policy "own credits" on public.credit_ledger for select to authenticated using (user_id = (select auth.uid()));

-- Withdrawn consent must be able to remove shared outcomes; users may delete their own.
grant delete on public.outcomes to authenticated;

-- Functions ---------------------------------------------------------------------------

create function public.credit_balance(p_uid uuid default auth.uid()) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::integer from public.credit_ledger
  where user_id = p_uid and (p_uid = auth.uid() or public.is_admin() or public.is_operator());
$$;

create function public.resolve_fact_report(p_report_id uuid, p_accepted boolean, p_credits integer default 2) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_report public.fact_reports;
begin
  if not public.is_admin() then
    raise exception 'Only admins can resolve reports' using errcode = '42501';
  end if;
  update public.fact_reports
    set status = case when p_accepted then 'accepted' else 'rejected' end, resolved_by = auth.uid(), resolved_at = now()
    where id = p_report_id and status = 'open'
    returning * into v_report;
  if not found then
    raise exception 'Report % is not open', p_report_id;
  end if;
  if p_accepted and p_credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref) values (v_report.user_id, p_credits, 'report_accepted', v_report.id);
  end if;
  insert into public.notifications (user_id, kind, title, body, program_id)
  values (
    v_report.user_id, 'report_resolved',
    case when p_accepted then 'Thanks, your report was correct' else 'We checked your report' end,
    case when p_accepted then format('We fixed the information and added %s credits to your account.', p_credits)
         else 'The official page still matches what we show. Thank you for checking.' end,
    v_report.program_id
  );
end;
$$;

create function public.grant_credits(p_user_id uuid, p_amount integer, p_reason text default 'admin_grant') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_operator()) then
    raise exception 'Only admins can grant credits' using errcode = '42501';
  end if;
  insert into public.credit_ledger (user_id, delta, reason) values (p_user_id, p_amount, p_reason);
end;
$$;

-- Demand-driven verification: shortlist counts per course and the nearest open deadline.
-- Aggregates only; no student is identifiable.
create function public.verification_demand(p_limit integer default 100)
returns table (program_id uuid, shortlists bigint, next_deadline timestamptz, facts_unverified bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_operator() or current_setting('role', true) = 'ingest_worker'
          or session_user = 'ingest_worker') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with demand as (
    select s.program_id, count(*) as n from public.shortlists s group by s.program_id
  )
  select d.program_id, d.n,
    (select min(dl.due_at) from public.deadlines dl join public.program_cycles c on c.id = dl.cycle_id
       where c.program_id = d.program_id and dl.due_at > now()),
    (select count(*) from public.fact_versions v join public.program_cycles c on c.id = v.cycle_id
       where c.program_id = d.program_id and v.review_state = 'pending')
  from demand d
  order by d.n desc, 3 asc nulls last
  limit least(greatest(p_limit, 1), 1000);
end;
$$;

-- The monitor tells students who shortlisted a course that one of its facts changed, without
-- the worker ever seeing who they are.
create function public.notify_program_watchers(p_program_id uuid, p_title text, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not (session_user = 'ingest_worker' or current_setting('role', true) = 'ingest_worker'
          or public.is_admin() or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.notifications (user_id, kind, title, body, program_id)
  select s.user_id, 'fact_changed', left(p_title, 200), left(p_body, 2000), p_program_id
  from public.shortlists s where s.program_id = p_program_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.resolve_fact_report, public.grant_credits, public.verification_demand,
  public.notify_program_watchers from public, anon;
grant execute on function public.verification_demand, public.notify_program_watchers to ingest_worker;
grant select, insert, update on public.program_sources to ingest_worker;
create policy "worker" on public.program_sources for all to ingest_worker using (true) with check (true);

-- Notifier role: sends reminder and notification emails. Reads only what an email needs.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'notifier') then
    create role notifier nologin noinherit;
  end if;
end
$$;
grant notifier to postgres;
grant usage on schema public to notifier;

-- Recipients come from this function, so the notifier never reads auth.users directly.
create function public.notifier_recipients()
returns table (user_id uuid, email text, reminder_days smallint[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (session_user = 'notifier' or current_setting('role', true) = 'notifier' or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select p.user_id, u.email::text, p.reminder_days
  from public.profiles p join auth.users u on u.id = p.user_id
  where p.reminders_enabled and p.consent_state in ('not_required', 'granted') and u.email is not null;
end;
$$;
revoke all on function public.notifier_recipients from public, anon, authenticated;
grant execute on function public.notifier_recipients to notifier;

grant select on public.applications, public.checklist_items, public.deadlines, public.program_cycles,
  public.programs, public.institutions, public.reminder_log, public.notifications to notifier;
grant insert on public.reminder_log to notifier;
grant update (emailed_at) on public.notifications to notifier;
create policy "notifier" on public.applications for select to notifier using (true);
create policy "notifier" on public.checklist_items for select to notifier using (true);
create policy "notifier" on public.deadlines for select to notifier using (published);
create policy "notifier" on public.program_cycles for select to notifier using (true);
create policy "notifier" on public.programs for select to notifier using (true);
create policy "notifier" on public.institutions for select to notifier using (true);
create policy "notifier" on public.reminder_log for all to notifier using (true) with check (true);
create policy "notifier" on public.notifications for all to notifier using (true) with check (true);
