-- Fee waivers: a fourth kind of sourced fact. Same provenance columns, review flow and visibility as deadlines.
create table public.fee_waivers (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.program_cycles (id) on delete cascade,
  applicant_category public.applicant_category not null default 'all',
  kind text not null check (kind in ('automatic', 'event', 'need_based', 'on_request')),
  amount numeric check (amount > 0),         -- null = the whole application fee is waived
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  conditions text,
  status public.fact_status not null default 'unknown',
  source_id uuid references public.sources (id) on delete set null,
  evidence_quote text,
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  verification_method public.verification_method,
  current_version_id uuid references public.fact_versions (id),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((amount is null) = (currency is null))
);
create index fee_waivers_cycle_idx on public.fee_waivers (cycle_id);
alter table public.fee_waivers enable row level security;
create policy "published facts" on public.fee_waivers for select to anon, authenticated
  using (published or (select public.is_admin()));
revoke insert, update, delete on public.fee_waivers from anon, authenticated;

create or replace function public.fact_table(p_subject public.fact_subject) returns text
language plpgsql immutable as $$
begin
  return case p_subject
    when 'requirement' then 'requirements'
    when 'deadline' then 'deadlines'
    when 'cost_item' then 'cost_items'
    when 'fee_waiver' then 'fee_waivers'
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
      when 'fee_waivers' then jsonb_build_object('kind', 'on_request')
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
