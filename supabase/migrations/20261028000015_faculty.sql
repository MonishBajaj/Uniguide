-- Weeks 7-12: faculty for research degrees, from OpenAlex (CC0). Facts about researchers and their
-- recent work; the student writes their own "why this university" sentences.

create extension if not exists vector with schema extensions;

create table public.faculty_profiles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  openalex_id text not null unique check (openalex_id ~ '^https://openalex\.org/A\d+$'),
  name text not null,
  orcid text,
  works_count integer,
  cited_by_count integer,
  topics jsonb not null default '[]',        -- [{name, field, subfield, count}]
  fields text[] not null default '{}',       -- OpenAlex field names, for filtering by subject
  recent_works jsonb not null default '[]',  -- [{title, year, doi, openalex_id}]
  research_text text not null default '',
  search_tsv tsvector generated always as (to_tsvector('english', coalesce(research_text, ''))) stored,
  embedding extensions.vector(1024),
  source_id uuid references public.sources (id) on delete set null,
  fetched_at timestamptz not null default now()
);
create index faculty_institution_idx on public.faculty_profiles (institution_id);
create index faculty_search_idx on public.faculty_profiles using gin (search_tsv);

alter table public.faculty_profiles enable row level security;
create policy "public read" on public.faculty_profiles for select to anon, authenticated using (true);
revoke insert, update, delete on public.faculty_profiles from anon, authenticated;
grant select, insert, update on public.faculty_profiles to ingest_worker;
create policy "worker" on public.faculty_profiles for all to ingest_worker using (true) with check (true);

-- Researchers at an institution ranked against the student's interests: by embedding similarity
-- when both sides have one, otherwise by full-text rank, otherwise by citations.
create function public.match_faculty(
  p_institution_id uuid,
  p_query text default null,
  p_fields text[] default null,
  p_query_embedding extensions.vector(1024) default null,
  p_limit integer default 12
) returns table (
  id uuid, name text, openalex_id text, orcid text, topics jsonb, recent_works jsonb, cited_by_count integer, score real
)
language sql stable set search_path = '' as $$
  select f.id, f.name, f.openalex_id, f.orcid, f.topics, f.recent_works, f.cited_by_count,
    (case
      when p_query_embedding is not null and f.embedding is not null
        then 1 - (f.embedding operator(extensions.<=>) p_query_embedding)
      when p_query is not null and btrim(p_query) <> ''
        then ts_rank(f.search_tsv, websearch_to_tsquery('english', p_query))
      else 0
    end)::real as score
  from public.faculty_profiles f
  where f.institution_id = p_institution_id
    and (p_fields is null or cardinality(p_fields) = 0 or f.fields && p_fields)
  order by score desc, f.cited_by_count desc nulls last
  limit least(greatest(p_limit, 1), 50);
$$;
