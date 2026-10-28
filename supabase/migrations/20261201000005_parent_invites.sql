-- 1.5 Parent portal: the student invites a parent with a one-time code, the parent accepts from
-- their own adult account, and the student can remove the link at any time. A weekly email tells
-- linked parents about deadlines and checklist progress (never grades, scores or writing).

alter table public.parent_links
  add column parent_name text check (length(parent_name) between 1 and 120),
  add column digest_enabled boolean not null default true;

create table public.parent_invites (
  code text primary key default encode(extensions.gen_random_bytes(6), 'hex'),
  student_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null check (length(student_name) between 1 and 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
create index parent_invites_student_idx on public.parent_invites (student_id, created_at desc);
alter table public.parent_invites enable row level security;
revoke all on public.parent_invites from anon;
revoke insert, update, delete on public.parent_invites from authenticated;
create policy "student reads own invites" on public.parent_invites for select to authenticated
  using (student_id = (select auth.uid()));

-- Student: make an invite. At most five unused, unexpired invites at a time.
create function public.create_parent_invite(p_student_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.can_process_personal_data(auth.uid()) then
    raise exception 'Your account needs a parent''s consent before you can share it' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_student_name)), 0) = 0 then
    raise exception 'Give the name your parent knows you by' using errcode = '22023';
  end if;
  if (select count(*) from public.parent_invites
      where student_id = auth.uid() and used_at is null and expires_at > now()) >= 5 then
    raise exception 'You have five open invites; wait for one to be used or expire' using errcode = '54000';
  end if;
  insert into public.parent_invites (student_id, student_name) values (auth.uid(), btrim(p_student_name))
  returning code into v_code;
  return v_code;
end;
$$;
revoke all on function public.create_parent_invite from public, anon;
grant execute on function public.create_parent_invite to authenticated;

-- What the join page may show before accepting: only the name the student chose, and whether the
-- code can still be used.
create function public.parent_invite_info(p_code text) returns table (student_name text, usable boolean)
language sql stable security definer set search_path = '' as $$
  select i.student_name, i.used_at is null and i.expires_at > now()
  from public.parent_invites i where i.code = lower(btrim(p_code));
$$;
revoke all on function public.parent_invite_info from public;
grant execute on function public.parent_invite_info to anon, authenticated;

-- Parent: accept from an adult account that is not being used as a student account.
create function public.accept_parent_invite(p_code text, p_parent_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.parent_invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into v_invite from public.parent_invites where code = lower(btrim(p_code)) for update;
  if not found or v_invite.used_at is not null or v_invite.expires_at <= now() then
    raise exception 'This invite has expired or was already used; ask for a new one' using errcode = 'P0002';
  end if;
  if v_invite.student_id = auth.uid() then
    raise exception 'You cannot accept your own invite' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.age_band = 'adult') then
    raise exception 'Only adults can join as a parent or guardian' using errcode = '42501';
  end if;
  if exists (select 1 from public.applications a where a.user_id = auth.uid())
     or exists (select 1 from public.shortlists s where s.user_id = auth.uid()) then
    raise exception 'This account is in use as a student account; please use a separate account as a parent' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_parent_name)), 0) = 0 then
    raise exception 'Give your name so your child can see who joined' using errcode = '22023';
  end if;

  insert into public.parent_links (parent_id, student_id, student_name, parent_name)
  values (auth.uid(), v_invite.student_id, v_invite.student_name, btrim(p_parent_name))
  on conflict (parent_id, student_id) do update
    set revoked_at = null, student_name = excluded.student_name, parent_name = excluded.parent_name, created_at = now();
  update public.parent_invites set used_at = now(), used_by = auth.uid() where code = v_invite.code;
  return v_invite.student_id;
end;
$$;
revoke all on function public.accept_parent_invite from public, anon;
grant execute on function public.accept_parent_invite to authenticated;

-- Student: remove a parent. Access ends at once.
create function public.revoke_parent_link(p_parent uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.parent_links set revoked_at = now()
  where parent_id = p_parent and student_id = auth.uid() and revoked_at is null;
  if not found then
    raise exception 'No active link' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.revoke_parent_link from public, anon;
grant execute on function public.revoke_parent_link to authenticated;

-- Parent: turn the weekly email on or off.
create function public.set_parent_digest(p_student uuid, p_enabled boolean) returns void
language sql security definer set search_path = '' as $$
  update public.parent_links set digest_enabled = p_enabled
  where parent_id = auth.uid() and student_id = p_student and revoked_at is null;
$$;
revoke all on function public.set_parent_digest from public, anon;
grant execute on function public.set_parent_digest to authenticated;

-- Weekly digest, sent by the notifier role. One email per parent and student per ISO week.
create table public.parent_digest_log (
  parent_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (parent_id, student_id, week_start)
);
alter table public.parent_digest_log enable row level security;
revoke all on public.parent_digest_log from anon, authenticated;
grant select, insert on public.parent_digest_log to notifier;
create policy "notifier" on public.parent_digest_log for all to notifier using (true) with check (true);

create function public.parent_digest_recipients()
returns table (parent_id uuid, email text, student_id uuid, student_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (session_user = 'notifier' or current_setting('role', true) = 'notifier' or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select l.parent_id, u.email::text, l.student_id, l.student_name
  from public.parent_links l
  join auth.users u on u.id = l.parent_id
  join public.profiles s on s.user_id = l.student_id
  where l.revoked_at is null and l.digest_enabled and u.email is not null
    and s.consent_state in ('not_required', 'granted');
end;
$$;
revoke all on function public.parent_digest_recipients from public, anon, authenticated;
grant execute on function public.parent_digest_recipients to notifier;
