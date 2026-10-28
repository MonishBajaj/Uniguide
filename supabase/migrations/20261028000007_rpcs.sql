-- The only paths that change published facts or consent state. All are SECURITY DEFINER
-- with their own authorisation checks, so the web app never needs the service-role key.

-- Recompute a program's coverage tier from its published facts.
create function public.recompute_coverage(p_program_id uuid) returns public.coverage_tier
language plpgsql security definer set search_path = '' as $$
declare
  v_tier public.coverage_tier;
begin
  with facts as (
    select r.status from public.requirements r join public.program_cycles c on c.id = r.cycle_id
      where c.program_id = p_program_id and r.published
    union all
    select d.status from public.deadlines d join public.program_cycles c on c.id = d.cycle_id
      where c.program_id = p_program_id and d.published
    union all
    select k.status from public.cost_items k join public.program_cycles c on c.id = k.cycle_id
      where c.program_id = p_program_id and k.published
  )
  select case
    when exists (select 1 from facts where status = 'verified') then 'verified'::public.coverage_tier
    when exists (select 1 from facts) then 'extracted'::public.coverage_tier
    else 'listed'::public.coverage_tier
  end into v_tier;

  update public.programs set coverage_tier = v_tier where id = p_program_id;
  return v_tier;
end;
$$;

-- Write a fact version into its typed table (insert or update) with the given provenance.
-- Internal: callers below check authorisation first.
create function public._apply_fact_version(
  p_version public.fact_versions,
  p_status public.fact_status,
  p_method public.verification_method,
  p_verified_at timestamptz,
  p_verified_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_table text := case p_version.subject
    when 'requirement' then 'requirements'
    when 'deadline' then 'deadlines'
    else 'cost_items'
  end;
  v_id uuid := coalesce(p_version.subject_id, gen_random_uuid());
  v_existing jsonb;
  v_defaults jsonb;
  v_row jsonb;
  v_set text;
  v_program uuid;
begin
  execute format('select to_jsonb(t) from public.%I t where id = $1', v_table) into v_existing using v_id;

  -- jsonb_populate_record does not apply column defaults, so a new row starts from these.
  v_defaults := jsonb_build_object('id', v_id, 'created_at', now(), 'applicant_category', 'all')
    || case v_table
      when 'requirements' then jsonb_build_object('is_desirable', false)
      when 'deadlines' then jsonb_build_object('kind', 'application', 'owning_system', 'direct',
        'timezone', 'UTC', 'precision', 'date')
      else jsonb_build_object('mandatory', true)
    end;

  v_row := coalesce(v_existing, v_defaults)
    -- A proposal may only carry fact fields; provenance is set here.
    || (p_version.proposed - array['id', 'cycle_id', 'status', 'published', 'source_id', 'evidence_quote',
          'verified_at', 'verified_by', 'verification_method', 'current_version_id', 'created_at', 'updated_at'])
    || jsonb_build_object(
      'cycle_id', p_version.cycle_id,
      'status', p_status,
      'published', true,
      'source_id', p_version.source_id,
      'evidence_quote', p_version.evidence_quote,
      'verified_at', p_verified_at,
      'verified_by', p_verified_by,
      'verification_method', p_method,
      'current_version_id', p_version.id,
      'updated_at', now()
    );

  select string_agg(format('%I = excluded.%I', column_name, column_name), ', ' order by ordinal_position)
    into v_set
    from information_schema.columns
    where table_schema = 'public' and table_name = v_table and column_name <> 'id';

  execute format(
    'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do update set %2$s',
    v_table, v_set
  ) using v_row;

  update public.fact_versions set subject_id = v_id where id = p_version.id;

  select program_id into v_program from public.program_cycles where id = p_version.cycle_id;
  perform public.recompute_coverage(v_program);
  return v_id;
end;
$$;
revoke all on function public._apply_fact_version(public.fact_versions, public.fact_status, public.verification_method, timestamptz, uuid) from public, anon, authenticated;

-- Admin approval (or the operator's seed loader). Marks the fact verified, or conflicting when
-- two official pages disagree, and supersedes the previous approved version.
create function public.promote_fact_version(
  p_version_id uuid,
  p_status public.fact_status default 'verified',
  p_method public.verification_method default 'human_review',
  p_verified_at timestamptz default null,
  p_reviewer_name text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.fact_versions;
  v_fact_id uuid;
begin
  if not (public.is_admin() or public.is_operator()) then
    raise exception 'Only admins can approve facts' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'conflicting') then
    raise exception 'A reviewed fact is either verified or conflicting';
  end if;
  if p_method not in ('human_review', 'seed_manual') then
    raise exception 'Approval must be a human review or a manual seed check';
  end if;

  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found then
    raise exception 'Fact version % not found', p_version_id;
  end if;
  if v_version.review_state not in ('pending') then
    raise exception 'Fact version % is already %', p_version_id, v_version.review_state;
  end if;

  v_fact_id := public._apply_fact_version(
    v_version, p_status, p_method, coalesce(p_verified_at, now()), auth.uid()
  );

  update public.fact_versions
    set review_state = 'superseded'
    where subject = v_version.subject and subject_id = v_fact_id and review_state = 'approved' and id <> p_version_id;

  update public.fact_versions
    set review_state = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        reject_reason = case when p_reviewer_name is not null then 'reviewer: ' || p_reviewer_name end
    where id = p_version_id;

  return v_fact_id;
end;
$$;

-- The worker publishes an extracted fact as "unverified" (the Extracted tier) once it has passed
-- the deterministic validators. It stays in the review queue, and it never overwrites a fact a
-- human has verified: a disagreement is left for the reviewer.
create function public.publish_extracted_version(p_version_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.fact_versions;
  v_table text;
  v_existing_status public.fact_status;
begin
  if not (session_user = 'ingest_worker' or current_setting('role', true) = 'ingest_worker'
          or public.is_admin() or public.is_operator()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found then
    raise exception 'Fact version % not found', p_version_id;
  end if;
  if v_version.review_state <> 'pending' then
    return null;
  end if;
  if exists (select 1 from jsonb_array_elements(v_version.validation) e where e ->> 'level' = 'error') then
    return null;
  end if;

  if v_version.subject_id is not null then
    v_table := case v_version.subject when 'requirement' then 'requirements' when 'deadline' then 'deadlines' else 'cost_items' end;
    execute format('select status from public.%I where id = $1', v_table) into v_existing_status using v_version.subject_id;
    if v_existing_status in ('verified', 'conflicting') then
      update public.fact_versions
        set validation = validation || jsonb_build_array(jsonb_build_object(
          'level', 'warning', 'code', 'differs_from_reviewed',
          'message', 'A reviewed value exists; this extraction waits for a human decision'))
        where id = p_version_id;
      return null;
    end if;
  end if;

  return public._apply_fact_version(v_version, 'unverified', 'automated_extraction', null, null);
end;
$$;

create function public.reject_fact_version(p_version_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.fact_versions;
  v_table text;
  v_program uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reject facts' using errcode = '42501';
  end if;
  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found or v_version.review_state <> 'pending' then
    raise exception 'Fact version % is not pending', p_version_id;
  end if;

  update public.fact_versions
    set review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
    where id = p_version_id;

  -- If this version was published as an unverified extraction, take it down.
  if v_version.subject_id is not null then
    v_table := case v_version.subject when 'requirement' then 'requirements' when 'deadline' then 'deadlines' else 'cost_items' end;
    execute format(
      'update public.%I set published = false where id = $1 and current_version_id = $2 and status = ''unverified''',
      v_table
    ) using v_version.subject_id, p_version_id;
    select program_id into v_program from public.program_cycles where id = v_version.cycle_id;
    perform public.recompute_coverage(v_program);
  end if;
end;
$$;

-- Parental consent -------------------------------------------------------------

-- Called by the signed-in child. The server generates the token, emails it to the parent and
-- passes only its sha256 here.
create function public.request_parental_consent(p_parent_email text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid() and consent_state = 'pending_parental') then
    raise exception 'Parental consent is not required for this account';
  end if;
  if p_parent_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid request';
  end if;
  if (select count(*) from public.parental_consent_requests
      where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many requests today';
  end if;

  insert into public.parental_consent_requests (user_id, parent_email, token_hash, expires_at)
  values (auth.uid(), lower(p_parent_email), p_token_hash, now() + interval '7 days')
  returning id into v_id;
  return v_id;
end;
$$;

-- Called from the parent's link (no sign-in). Grants consent if the token is valid.
create function public.confirm_parental_consent(p_token text, p_policy_version text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.parental_consent_requests;
begin
  select * into v_request from public.parental_consent_requests
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and confirmed_at is null
      and expires_at > now()
    for update;
  if not found then
    return false;
  end if;

  update public.parental_consent_requests set confirmed_at = now() where id = v_request.id;
  insert into public.consents (user_id, kind, policy_version, method, evidence)
  values (
    v_request.user_id, 'parental', p_policy_version, 'email_link',
    jsonb_build_object('parent_email_sha256', encode(extensions.digest(v_request.parent_email, 'sha256'), 'hex'),
                       'request_id', v_request.id)
  );
  update public.profiles set consent_state = 'granted'
    where user_id = v_request.user_id and consent_state = 'pending_parental';
  return true;
end;
$$;

revoke all on function public.promote_fact_version, public.publish_extracted_version, public.reject_fact_version,
  public.request_parental_consent, public.recompute_coverage from public, anon;
grant execute on function public.promote_fact_version, public.reject_fact_version, public.request_parental_consent
  to authenticated;
grant execute on function public.confirm_parental_consent to anon, authenticated;
revoke all on function public.recompute_coverage from authenticated;

-- Read models ------------------------------------------------------------------

-- security_invoker: the caller's RLS applies, so counts only include facts the caller may see.
create view public.program_cards with (security_invoker = true) as
select
  p.id, p.slug, p.title, p.level, p.isced_level, p.isced_f, p.cip, p.field_label, p.track,
  p.delivery_mode, p.duration_months, p.required_credits, p.credit_system, p.languages_of_instruction,
  p.official_url, p.coverage_tier, p.published, p.updated_at,
  i.id as institution_id, i.name as institution_name, i.country, i.city,
  (
    select count(*) from public.requirements r join public.program_cycles c on c.id = r.cycle_id
    where c.program_id = p.id and c.is_current
  ) + (
    select count(*) from public.deadlines d join public.program_cycles c on c.id = d.cycle_id
    where c.program_id = p.id and c.is_current
  ) + (
    select count(*) from public.cost_items k join public.program_cycles c on c.id = k.cycle_id
    where c.program_id = p.id and c.is_current
  ) as facts_total,
  (
    select count(*) from public.requirements r join public.program_cycles c on c.id = r.cycle_id
    where c.program_id = p.id and c.is_current and r.status = 'verified'
  ) + (
    select count(*) from public.deadlines d join public.program_cycles c on c.id = d.cycle_id
    where c.program_id = p.id and c.is_current and d.status = 'verified'
  ) + (
    select count(*) from public.cost_items k join public.program_cycles c on c.id = k.cycle_id
    where c.program_id = p.id and c.is_current and k.status = 'verified'
  ) as facts_verified
from public.programs p
join public.institutions i on i.id = p.institution_id;

-- Hard filters that do not depend on the student's numbers (level, country, field, delivery,
-- text). Budget, deadlines and eligibility are applied by packages/matching on the result.
create function public.search_programs(
  p_query text default null,
  p_levels public.program_level[] default null,
  p_countries text[] default null,
  p_fields text[] default null,
  p_delivery public.delivery_mode[] default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns setof public.program_cards
language sql stable set search_path = '' as $$
  select c.*
  from public.program_cards c
  join public.programs p on p.id = c.id
  where (p_levels is null or cardinality(p_levels) = 0 or c.level = any (p_levels))
    and (p_countries is null or cardinality(p_countries) = 0 or c.country = any (p_countries))
    and (p_delivery is null or cardinality(p_delivery) = 0 or c.delivery_mode = any (p_delivery))
    and (p_fields is null or cardinality(p_fields) = 0
         or exists (select 1 from unnest(p_fields) f where c.isced_f like f || '%'))
    and (p_query is null or btrim(p_query) = ''
         or p.search_tsv @@ websearch_to_tsquery('simple', p_query)
         or c.institution_name ilike '%' || p_query || '%')
  order by c.coverage_tier desc, c.institution_name, c.title
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
