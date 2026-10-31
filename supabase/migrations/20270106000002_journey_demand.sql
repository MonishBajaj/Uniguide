-- Journey M6 (J6.4, spec G25): students' next steps raise verification demand.
--
-- A step quotes the facts it relies on (journey_state.steps[].factRefs). For each course, journey_steps counts the
-- students whose journey from the last 14 days has a next step quoting one of the course's deadlines or
-- requirements that is still unverified or conflicting now. Reviewers and the source monitor take those courses
-- first. Only counts leave these functions, never who.

-- Facts quoted by recent next steps that still need checking, with how many students' steps quote each.
create function public.journey_fact_demand()
returns table (fact_table text, fact_id uuid, students bigint)
language sql stable security definer set search_path = '' as $$
  with refs as (
    select distinct js.user_id, r ->> 'table' as fact_table, (r ->> 'id')::uuid as fact_id
    from public.journey_state js
    cross join lateral jsonb_array_elements(js.steps) s(step)
    cross join lateral jsonb_array_elements(coalesce(s.step -> 'factRefs', '[]')) r
    where js.computed_at > now() - interval '14 days'
      and r ->> 'table' in ('deadlines', 'requirements', 'country_rules')
  )
  select f.fact_table, f.fact_id, count(*)
  from refs f
  where case f.fact_table
    when 'deadlines' then exists (select 1 from public.deadlines d where d.id = f.fact_id and d.status in ('unverified', 'conflicting'))
    when 'requirements' then exists (select 1 from public.requirements q where q.id = f.fact_id and q.status in ('unverified', 'conflicting'))
    else exists (select 1 from public.country_rules c where c.id = f.fact_id and c.status in ('unverified', 'conflicting'))
  end
  group by f.fact_table, f.fact_id;
$$;
revoke all on function public.journey_fact_demand from public, anon, authenticated;

drop function public.verification_demand(integer);
create function public.verification_demand(p_limit integer default 100)
returns table (program_id uuid, shortlists bigint, next_deadline timestamptz, facts_unverified bigint, journey_steps bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_operator() or current_setting('role', true) = 'ingest_worker'
          or session_user = 'ingest_worker' or cardinality(public.verifier_countries()) > 0) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with journeys as (
    -- Distinct students per course: one student can quote several facts of the same course.
    select c.program_id, count(distinct js.user_id) as n
    from public.journey_state js
    cross join lateral jsonb_array_elements(js.steps) s(step)
    cross join lateral jsonb_array_elements(coalesce(s.step -> 'factRefs', '[]')) r
    left join public.deadlines d on r ->> 'table' = 'deadlines' and d.id = (r ->> 'id')::uuid
    left join public.requirements q on r ->> 'table' = 'requirements' and q.id = (r ->> 'id')::uuid
    join public.program_cycles c on c.id = coalesce(d.cycle_id, q.cycle_id)
    where js.computed_at > now() - interval '14 days'
      and coalesce(d.status, q.status) in ('unverified', 'conflicting')
    group by c.program_id
  ),
  shortlisted as (
    select s.program_id, count(*) as n from public.shortlists s group by s.program_id
  ),
  demand as (
    select coalesce(sh.program_id, j.program_id) as program_id, coalesce(sh.n, 0) as shortlists, coalesce(j.n, 0) as journey_steps
    from shortlisted sh full join journeys j on j.program_id = sh.program_id
  )
  select d.program_id, d.shortlists,
    (select min(dl.due_at) from public.deadlines dl join public.program_cycles c on c.id = dl.cycle_id
       where c.program_id = d.program_id and dl.due_at > now()),
    (select count(*) from public.fact_versions v join public.program_cycles c on c.id = v.cycle_id
       where c.program_id = d.program_id and v.review_state = 'pending'),
    d.journey_steps
  from demand d
  order by d.journey_steps desc, d.shortlists desc, 3 asc nulls last
  limit least(greatest(p_limit, 1), 1000);
end;
$$;
revoke all on function public.verification_demand from public, anon;
grant execute on function public.verification_demand to authenticated, ingest_worker;

-- The same count for country rules, for /admin/rules.
create function public.rule_demand()
returns table (rule_id uuid, journey_steps bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_operator() or cardinality(public.verifier_countries()) > 0) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select f.fact_id, f.students from public.journey_fact_demand() f where f.fact_table = 'country_rules'
    order by f.students desc;
end;
$$;
revoke all on function public.rule_demand from public, anon;
grant execute on function public.rule_demand to authenticated;
