-- Parent access: a parent account sees a linked student's shortlist and tracker, read only.
-- Writing (drafts, reviews, story answers) and the profile row (grades, scores, budget) are never shared.
-- Links are created by an operator today (seed or SQL); a student-issued invite flow comes later.
create table public.parent_links (
  parent_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null check (length(student_name) between 1 and 120),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (parent_id, student_id),
  check (parent_id <> student_id)
);
alter table public.parent_links enable row level security;
revoke all on public.parent_links from anon;
revoke insert, update, delete on public.parent_links from authenticated;

create policy "parent reads own links" on public.parent_links for select to authenticated
  using (parent_id = (select auth.uid()) and revoked_at is null);
create policy "student reads own links" on public.parent_links for select to authenticated
  using (student_id = (select auth.uid()));

-- True while the caller is a parent with an active link to the student.
create function public.parent_can_see(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.parent_links l
    where l.student_id = p_student and l.parent_id = auth.uid() and l.revoked_at is null
  );
$$;
revoke all on function public.parent_can_see from public, anon;
grant execute on function public.parent_can_see to authenticated;

create policy "parents read linked" on public.shortlists for select to authenticated using (public.parent_can_see(user_id));
create policy "parents read linked" on public.applications for select to authenticated using (public.parent_can_see(user_id));
create policy "parents read linked" on public.checklist_items for select to authenticated using (public.parent_can_see(user_id));
