-- Admins open a new intake for a course (the extractor needs one to attach page facts to).
-- Only the newest real intake stays current.
create function public.add_program_cycle(
  p_program_id uuid, p_intake_year smallint, p_intake_term text, p_starts_on date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (public.is_admin() or public.is_operator()) then
    raise exception 'Only admins can add intakes' using errcode = '42501';
  end if;
  insert into public.program_cycles (program_id, label, intake_year, intake_term, starts_on, is_current)
  values (p_program_id, p_intake_year || '-' || p_intake_term, p_intake_year, p_intake_term, p_starts_on, true)
  on conflict (program_id, label) do update set starts_on = coalesce(excluded.starts_on, public.program_cycles.starts_on),
    is_current = true
  returning id into v_id;
  update public.program_cycles set is_current = false
    where program_id = p_program_id and intake_term <> 'any' and intake_year < p_intake_year;
  return v_id;
end;
$$;
revoke all on function public.add_program_cycle from public, anon;
