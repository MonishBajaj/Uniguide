-- Part 3 community base: one pre-moderated table for stories, reviews, questions and answers, with
-- reports and self-declared alumni. Nothing appears until an admin publishes it. Authors are
-- pseudonymous: author_id is never readable through the API, only the pseudonym they chose.
-- Posting needs an adult account whose consent is processed. The web app keeps all of this behind
-- COMMUNITY_ENABLED until legal review.

create type public.community_kind as enum ('story', 'review', 'question', 'answer', 'ama_question');
create type public.community_status as enum ('pending', 'published', 'rejected', 'removed');

-- Adults only (birth month, erring younger), with consent processed.
create function public.can_post_community(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select public.age_in_years(p.birth_month) >= 18 and p.consent_state in ('not_required', 'granted')
     from public.profiles p where p.user_id = uid),
    false
  );
$$;

-- A review scores teaching, support and value, each a whole number from 1 to 5.
create function public.valid_ratings(r jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object'
     and (select count(*) from jsonb_object_keys(r)) = 3
     and r ?& array['teaching', 'support', 'value']
     and (select bool_and(jsonb_typeof(e.value) = 'number' and e.value::text in ('1', '2', '3', '4', '5')) from jsonb_each(r) as e);
$$;

create table public.community_alumni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  graduation_year smallint not null check (graduation_year between 1950 and 2100),
  evidence text check (length(evidence) <= 500),   -- how they can show it, for the moderator only
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, program_id)
);

create function public.is_alum(uid uuid, p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_alumni a where a.user_id = uid and a.program_id = p_program and a.status = 'approved');
$$;

create function public.admitted_to(uid uuid, p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a join public.program_cycles c on c.id = a.cycle_id
    where a.user_id = uid and c.program_id = p_program and a.decision = 'admitted'
  );
$$;

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  kind public.community_kind not null,
  program_id uuid references public.programs (id) on delete cascade,
  parent_id uuid references public.community_posts (id) on delete cascade,
  pseudonym text not null check (length(btrim(pseudonym)) between 2 and 40),
  title text check (length(btrim(title)) between 3 and 140),
  body text not null check (length(btrim(body)) between 10 and 6000),
  ratings jsonb check (ratings is null or public.valid_ratings(ratings)),
  country char(2) check (country ~ '^[A-Z]{2}$'),
  level public.program_level,
  badge text,                       -- set by the database, e.g. "Alum, class of 2024"
  status public.community_status not null default 'pending',
  staff_answer text check (length(staff_answer) <= 6000),
  moderation_note text check (length(moderation_note) <= 500),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'story' or title is not null),
  check (kind <> 'review' or (program_id is not null and ratings is not null)),
  check (kind = 'review' or ratings is null),
  check (kind <> 'question' or program_id is not null),
  check (kind <> 'answer' or parent_id is not null),
  -- No contact details: people meet through posts, never off the platform. The app also blocks
  -- phone numbers and social handles; these are the patterns the database can be sure of.
  check (body !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' and body !~* '(https?://|www\.)'),
  check (pseudonym !~* '(@|https?://|www\.)')
);
create index community_posts_feed_idx on public.community_posts (kind, status, created_at desc);
create index community_posts_program_idx on public.community_posts (program_id, kind) where status = 'published';
create index community_posts_parent_idx on public.community_posts (parent_id);
-- One live review per student and course.
create unique index community_one_review_idx on public.community_posts (author_id, program_id)
  where kind = 'review' and status in ('pending', 'published');

create function public.community_pending_count(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.community_posts where author_id = uid and status = 'pending';
$$;

create function public.can_answer(uid uuid, p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_posts q
    where q.id = p_parent and q.kind = 'question' and q.status = 'published' and public.is_alum(uid, q.program_id)
  );
$$;

-- Everything a user cannot be trusted to set: status, badge, moderation fields.
create function public.community_post_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.status := 'pending';
  new.staff_answer := null;
  new.moderation_note := null;
  new.moderated_by := null;
  new.moderated_at := null;
  new.badge := null;
  if new.kind = 'review' then
    new.badge := 'Admitted here (self-reported)';
  elsif new.kind = 'answer' then
    select q.program_id into new.program_id from public.community_posts q where q.id = new.parent_id;
    select 'Alum, class of ' || a.graduation_year into new.badge
      from public.community_alumni a
      where a.user_id = new.author_id and a.program_id = new.program_id and a.status = 'approved';
  end if;
  return new;
end;
$$;
create trigger community_post_defaults before insert on public.community_posts
  for each row execute function public.community_post_defaults();

alter table public.community_posts enable row level security;
alter table public.community_alumni enable row level security;
revoke all on public.community_posts, public.community_alumni from anon, authenticated;

-- author_id is deliberately missing from the readable columns.
grant select (id, kind, program_id, parent_id, pseudonym, title, body, ratings, country, level, badge, status, staff_answer, moderation_note, created_at)
  on public.community_posts to anon, authenticated;
grant insert (author_id, kind, program_id, parent_id, pseudonym, title, body, ratings, country, level) on public.community_posts to authenticated;
grant delete on public.community_posts to authenticated;

create policy "published" on public.community_posts for select to anon, authenticated using (status = 'published');
create policy "own" on public.community_posts for select to authenticated using (author_id = (select auth.uid()));
create policy "admins" on public.community_posts for select to authenticated using ((select public.is_admin()));
create policy "post" on public.community_posts for insert to authenticated with check (
  author_id = (select auth.uid())
  and public.can_post_community(author_id)
  and public.community_pending_count(author_id) < 5
  and case kind
        when 'story' then true
        when 'question' then true
        when 'review' then public.admitted_to(author_id, program_id)
        when 'answer' then public.can_answer(author_id, parent_id)
        else false   -- AMA questions open with 11.6
      end
);
create policy "withdraw own" on public.community_posts for delete to authenticated using (author_id = (select auth.uid()));

grant select, insert (user_id, program_id, graduation_year, evidence), delete on public.community_alumni to authenticated;
create policy "own" on public.community_alumni for select to authenticated using (user_id = (select auth.uid()));
create policy "admins" on public.community_alumni for select to authenticated using ((select public.is_admin()));
create policy "request" on public.community_alumni for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_post_community(user_id) and status = 'pending');
create policy "withdraw own" on public.community_alumni for delete to authenticated using (user_id = (select auth.uid()));

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('contact_details', 'abuse', 'misleading', 'spam', 'other')),
  note text check (length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);
create index community_reports_open_idx on public.community_reports (status, created_at);

create function public.is_published_post(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_posts where id = p_post and status = 'published');
$$;

alter table public.community_reports enable row level security;
revoke all on public.community_reports from anon, authenticated;
grant select, insert (post_id, reporter_id, reason, note) on public.community_reports to authenticated;
create policy "own" on public.community_reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy "admins" on public.community_reports for select to authenticated using ((select public.is_admin()));
create policy "report" on public.community_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and public.is_published_post(post_id));

-- Three separate reports take a post down until a moderator looks again.
create function public.community_hide_reported() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.community_reports where post_id = new.post_id and status = 'open') >= 3 then
    update public.community_posts set status = 'pending', moderation_note = 'Hidden after 3 reports'
      where id = new.post_id and status = 'published';
  end if;
  return new;
end;
$$;
create trigger community_hide_reported after insert on public.community_reports
  for each row execute function public.community_hide_reported();

-- Moderation: admins only.
create function public.moderate_community_post(p_post uuid, p_status public.community_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can moderate' using errcode = '42501';
  end if;
  if p_status = 'pending' then
    raise exception 'Choose published, rejected or removed' using errcode = '22023';
  end if;
  update public.community_posts
    set status = p_status, moderation_note = left(p_note, 500), moderated_by = auth.uid(), moderated_at = now()
    where id = p_post;
end;
$$;

create function public.resolve_community_report(p_report uuid, p_uphold boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_post uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can moderate' using errcode = '42501';
  end if;
  update public.community_reports
    set status = case when p_uphold then 'upheld' else 'dismissed' end, resolved_by = auth.uid(), resolved_at = now()
    where id = p_report
    returning post_id into v_post;
  if p_uphold then
    update public.community_posts set status = 'removed', moderation_note = 'Removed after a report', moderated_by = auth.uid(), moderated_at = now()
      where id = v_post;
  end if;
end;
$$;

create function public.review_community_alum(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can moderate' using errcode = '42501';
  end if;
  update public.community_alumni
    set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id;
end;
$$;

-- An author's own posts, whatever their status (author_id is not readable directly).
create function public.my_community_posts()
returns table (id uuid, kind public.community_kind, title text, body text, status public.community_status, moderation_note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.title, p.body, p.status, p.moderation_note, p.created_at
  from public.community_posts p where p.author_id = auth.uid() order by p.created_at desc;
$$;

revoke all on function public.can_post_community, public.is_alum, public.admitted_to, public.community_pending_count, public.can_answer,
  public.is_published_post, public.moderate_community_post, public.resolve_community_report, public.review_community_alum,
  public.my_community_posts from public, anon;
grant execute on function public.can_post_community, public.is_alum, public.admitted_to, public.community_pending_count, public.can_answer,
  public.is_published_post, public.moderate_community_post, public.resolve_community_report, public.review_community_alum,
  public.my_community_posts to authenticated;
