-- Journey M6 (J6.2): parent titles in the parent's language.
--
-- parent_journey() also returns each step's catalogue id and the values its parent title uses ({course}, {rule},
-- {date}), so the web app can show the title in Hindi. Those values already appear in the English parent title, so
-- a parent sees nothing new. Every other step parameter (scores, documents, recommenders) is left out.

create or replace function public.parent_journey(p_student uuid) returns jsonb
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
      select jsonb_agg(jsonb_build_object(
          'parentTitle', s.step ->> 'parentTitle',
          'stage', (s.step ->> 'stage')::int,
          'catalogueId', s.step ->> 'catalogueId',
          'params', coalesce((
            select jsonb_object_agg(p.key, p.value)
            from jsonb_each(coalesce(s.step -> 'copy' -> 'params', '{}')) p
            where p.key in ('course', 'rule', 'date')), '{}'))
        order by s.n)
      from (
        select e.step, e.n from jsonb_array_elements(v_state.steps) with ordinality as e(step, n)
        where coalesce(e.step ->> 'parentTitle', '') <> ''
        order by e.n limit 5
      ) s), '[]'));
end;
$$;
revoke all on function public.parent_journey from public, anon;
grant execute on function public.parent_journey to authenticated;
