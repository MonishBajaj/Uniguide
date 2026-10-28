-- Admin entry for country rules and published admit rates. Both start unverified; a second call
-- verifies them. Admins cannot write sources directly, so these RPCs register the source too.

create function public._admin_source(p_url text, p_owner text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https?://' then
    raise exception 'Source must be an http(s) URL' using errcode = '22023';
  end if;
  insert into public.sources (url, owner, rights_note, robots_ok, fetched_at)
  values (p_url, p_owner, 'Entered by a reviewer from the official page; short quote only.', true, now())
  on conflict (url, coalesce(content_hash, '')) do update set fetched_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public._admin_source from public, anon, authenticated;

create function public.add_country_rule(
  p_destination char(2), p_kind text, p_title text, p_source_url text, p_quote text,
  p_applies_to char(2)[] default '{}', p_details text default null, p_link text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add rules' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_quote)), 0) = 0 then
    raise exception 'A rule needs the quote it rests on' using errcode = '22023';
  end if;
  insert into public.country_rules (destination, applies_to, kind, title, details, link, source_id, evidence_quote)
  values (upper(p_destination), p_applies_to, p_kind, p_title, p_details, coalesce(p_link, p_source_url),
          public._admin_source(p_source_url, 'Official page'), p_quote)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_country_rule from public, anon;

create function public.add_program_stat(
  p_program_id uuid, p_cycle_label text, p_admit_rate numeric, p_source_url text, p_quote text,
  p_applicants integer default null, p_admitted integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can add statistics' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_quote)), 0) = 0 then
    raise exception 'A statistic needs the quote it rests on' using errcode = '22023';
  end if;
  insert into public.program_stats (program_id, cycle_label, admit_rate, applicants, admitted, source_id, evidence_quote)
  values (p_program_id, p_cycle_label, p_admit_rate, p_applicants, p_admitted,
          public._admin_source(p_source_url, 'Official page'), p_quote)
  on conflict (program_id, cycle_label) do update
    set admit_rate = excluded.admit_rate, applicants = excluded.applicants, admitted = excluded.admitted,
        source_id = excluded.source_id, evidence_quote = excluded.evidence_quote,
        status = 'unverified', verified_at = null, published = false
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_program_stat from public, anon;

create function public.verify_program_stat(p_stat_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can verify statistics' using errcode = '42501';
  end if;
  update public.program_stats set status = 'verified', verified_at = now(), published = true where id = p_stat_id;
end;
$$;
revoke all on function public.verify_program_stat from public, anon;
