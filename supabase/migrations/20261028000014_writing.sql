-- Weeks 7-12: the writing coach. It comments, asks and quotes the student's own sentences;
-- it never writes paragraphs. Every saved version carries an authorship log the student can export.

create type public.document_kind as enum ('statement_of_purpose', 'personal_statement', 'why_this_university', 'other');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  kind public.document_kind not null,
  title text not null check (length(title) between 1 and 200),
  word_limit integer check (word_limit between 50 and 5000),
  question text check (length(question) <= 2000),   -- the institution's prompt, pasted by the student
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(body) <= 60000),
  word_count integer not null,
  -- Authorship log for this editing session: typed vs pasted characters, paste events, timings.
  authorship jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index document_versions_doc_idx on public.document_versions (document_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version_id uuid not null references public.document_versions (id) on delete cascade,
  compared_version_id uuid references public.document_versions (id) on delete cascade,
  kind text not null check (kind in ('rubric', 'comparison')),
  model text not null,
  prompt_version text not null,
  result jsonb not null,
  ai_run_id uuid references public.ai_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.story_answers (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id text not null check (question_id ~ '^[a-z0-9_]{2,40}$'),
  answer text not null check (length(answer) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.reviews enable row level security;
alter table public.story_answers enable row level security;
revoke all on public.documents, public.document_versions, public.reviews, public.story_answers from anon;
-- Reviews are written only by the server action after charging credits through spend_credits.
revoke insert, update on public.reviews from authenticated;

create policy "own rows" on public.documents for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.documents for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));
create policy "own rows update" on public.documents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows delete" on public.documents for delete to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.document_versions for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.document_versions for insert to authenticated
  with check (
    user_id = (select auth.uid()) and public.can_process_personal_data(user_id)
    and exists (select 1 from public.documents d where d.id = document_id and d.user_id = (select auth.uid()))
  );
-- Versions are an append-only history: no updates.
revoke update on public.document_versions from authenticated;
create policy "own rows delete" on public.document_versions for delete to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.reviews for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows delete" on public.reviews for delete to authenticated using (user_id = (select auth.uid()));

create policy "own rows" on public.story_answers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id));

-- Charges an AI writing action and records the review in one step. The first rubric review is
-- free (the free tier's one diagnostic); everything after costs credits.
create function public.record_writing_review(
  p_version_id uuid,
  p_kind text,
  p_model text,
  p_prompt_version text,
  p_result jsonb,
  p_compared_version_id uuid default null,
  p_ai_run_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cost integer;
  v_id uuid;
begin
  if v_uid is null or not public.can_process_personal_data(v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_versions where id = p_version_id and user_id = v_uid)
     or (p_compared_version_id is not null
         and not exists (select 1 from public.document_versions where id = p_compared_version_id and user_id = v_uid)) then
    raise exception 'Not your draft' using errcode = '42501';
  end if;
  v_cost := case
    when p_kind = 'rubric' and not exists (select 1 from public.reviews where user_id = v_uid and kind = 'rubric') then 0
    else 1
  end;
  if v_cost > 0 then
    -- Serialise per user so two simultaneous reviews cannot both spend the last credit.
    perform pg_advisory_xact_lock(hashtext(v_uid::text));
    if public.credit_balance(v_uid) < v_cost then
      raise exception 'insufficient_credits' using errcode = 'P0001';
    end if;
    insert into public.credit_ledger (user_id, delta, reason)
    values (v_uid, -v_cost, case when p_kind = 'rubric' then 'writing_review' else 'draft_comparison' end);
  end if;
  insert into public.reviews (user_id, version_id, compared_version_id, kind, model, prompt_version, result, ai_run_id)
  values (v_uid, p_version_id, p_compared_version_id, p_kind, p_model, p_prompt_version, p_result, p_ai_run_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Whether the next AI writing action would be free, and the balance; checked before calling the model.
create function public.writing_allowance() returns table (free_review boolean, balance integer)
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.reviews where user_id = auth.uid() and kind = 'rubric'),
         public.credit_balance(auth.uid());
$$;
revoke all on function public.record_writing_review, public.writing_allowance from public, anon;
grant execute on function public.record_writing_review, public.writing_allowance to authenticated;
