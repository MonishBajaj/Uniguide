-- Journey M4 (J4.2, J4.4): the journey for the people a student shares with.
--
-- Parents (spec 3.5, 6.5) read through parent_journey(): the stage, the progress line and only the
-- steps that have a parent-safe title, never a step's own title, reason, link, facts or due date, so
-- writing, grade and score steps (which never have a parentTitle) can't reach a parent.
--
-- Counselors with an active share (spec 3.6, G22) read journey_state itself, like the student's other
-- shared rows.

create function public.parent_journey(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_state public.journey_state;
begin
  if not public.parent_can_see(p_student) then
    raise exception 'Not a linked parent of this student' using errcode = '42501';
  end if;
  select * into v_state from public.journey_state where user_id = p_student;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'stage', v_state.stage,
    'progress', jsonb_build_object(
      'done', coalesce((v_state.stage_progress ->> 'done')::int, 0),
      'total', coalesce((v_state.stage_progress ->> 'total')::int, 0),
      'label', coalesce(v_state.stage_progress ->> 'label', '')),
    'computedAt', v_state.computed_at,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('parentTitle', s.step ->> 'parentTitle', 'stage', (s.step ->> 'stage')::int) order by s.n)
      from (
        select e.step, e.n from jsonb_array_elements(v_state.steps) with ordinality as e(step, n)
        where coalesce(e.step ->> 'parentTitle', '') <> ''
        order by e.n limit 5
      ) s), '[]'));
end;
$$;
revoke all on function public.parent_journey from public, anon;
grant execute on function public.parent_journey to authenticated;

create policy "counselors read shared" on public.journey_state for select to authenticated
  using (public.counselor_can_see(user_id));
