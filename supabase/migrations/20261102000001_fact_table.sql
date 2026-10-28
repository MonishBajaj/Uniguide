-- One mapping from a fact subject to its table, replacing three hard-coded CASE expressions
-- whose ELSE silently meant cost_items. An unknown subject now raises.
create function public.raise_unknown_fact_subject(p_subject public.fact_subject) returns text
language plpgsql volatile as $$
begin
  raise exception 'unknown fact subject %', p_subject;
end;
$$;

create function public.fact_table(p_subject public.fact_subject) returns text
language plpgsql immutable as $$
begin
  return case p_subject
    when 'requirement' then 'requirements'
    when 'deadline' then 'deadlines'
    when 'cost_item' then 'cost_items'
    else public.raise_unknown_fact_subject(p_subject)
  end;
end;
$$;

CREATE OR REPLACE FUNCTION public._apply_fact_version(p_version fact_versions, p_status fact_status, p_method verification_method, p_verified_at timestamp with time zone, p_verified_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_table text := public.fact_table(p_version.subject);
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
      when 'cost_items' then jsonb_build_object('mandatory', true)
      else public.raise_unknown_fact_subject(null)::jsonb
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
$function$;

CREATE OR REPLACE FUNCTION public.publish_extracted_version(p_version_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_table := public.fact_table(v_version.subject);
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
$function$;

CREATE OR REPLACE FUNCTION public.reject_fact_version(p_version_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_version public.fact_versions;
  v_table text;
  v_program uuid;
begin
  select * into v_version from public.fact_versions where id = p_version_id for update;
  if not found or not public.can_review_cycle(v_version.cycle_id) then
    raise exception 'Only admins and this country''s verifiers can reject facts' using errcode = '42501';
  end if;
  if v_version.review_state <> 'pending' then
    raise exception 'Fact version % is not pending', p_version_id;
  end if;

  update public.fact_versions
    set review_state = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = p_reason
    where id = p_version_id;

  if v_version.subject_id is not null then
    v_table := public.fact_table(v_version.subject);
    execute format(
      'update public.%I set published = false where id = $1 and current_version_id = $2 and status = ''unverified''',
      v_table
    ) using v_version.subject_id, p_version_id;
    select program_id into v_program from public.program_cycles where id = v_version.cycle_id;
    perform public.recompute_coverage(v_program);
  end if;
end;
$function$;
