-- 11.6 Seasonal AMAs: admins schedule an event with a named host; students send questions until it
-- ends; questions are moderated like any post, and the host's answers are posted by an admin.
-- Past events stay as an archive.
create table public.community_amas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 140),
  host_name text not null check (length(btrim(host_name)) between 2 and 80),
  host_role text check (length(host_role) <= 140),
  topic text check (length(topic) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index community_amas_time_idx on public.community_amas (starts_at desc) where published;

alter table public.community_amas enable row level security;
revoke all on public.community_amas from anon;
grant select on public.community_amas to anon;
create policy "published" on public.community_amas for select to anon, authenticated using (published or (select public.is_admin()));
create policy "admins manage" on public.community_amas for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.community_posts add column ama_id uuid references public.community_amas (id) on delete cascade;
alter table public.community_posts add constraint community_posts_ama_question check (kind <> 'ama_question' or ama_id is not null);
create index community_posts_ama_idx on public.community_posts (ama_id) where ama_id is not null;
grant select (ama_id), insert (ama_id) on public.community_posts to authenticated;
grant select (ama_id) on public.community_posts to anon;

-- Questions are taken from publication until the event ends.
create function public.ama_open(p_ama uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.community_amas where id = p_ama and published and now() < ends_at);
$$;

drop policy "post" on public.community_posts;
create policy "post" on public.community_posts for insert to authenticated with check (
  author_id = (select auth.uid())
  and public.can_post_community(author_id)
  and public.community_pending_count(author_id) < 5
  and case kind
        when 'story' then true
        when 'question' then true
        when 'review' then public.admitted_to(author_id, program_id)
        when 'answer' then public.can_answer(author_id, parent_id)
        when 'ama_question' then public.ama_open(ama_id)
        else false
      end
);

-- The host's answer, posted by an admin; it also publishes the question.
create function public.answer_ama_question(p_post uuid, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins post AMA answers' using errcode = '42501';
  end if;
  update public.community_posts
    set staff_answer = nullif(btrim(p_answer), ''), status = 'published', moderated_by = auth.uid(), moderated_at = now()
    where id = p_post and kind = 'ama_question';
end;
$$;

revoke all on function public.ama_open, public.answer_ama_question from public, anon;
grant execute on function public.ama_open, public.answer_ama_question to authenticated;
