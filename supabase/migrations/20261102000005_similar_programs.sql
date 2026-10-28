-- Other courses at the same level and in the same broad field (first three digits of the ISCED-F code),
-- at other institutions. Exact field matches first, then verified courses first, then by title.
-- Not security definer: row-level security decides which courses the caller can see.
create function public.similar_programs(p_program uuid, p_limit integer default 4)
returns setof public.programs
language sql stable as $$
  select p.*
  from public.programs p
  join public.programs me on me.id = p_program
  where me.isced_f is not null
    and p.id <> me.id
    and p.published
    and p.level = me.level
    and p.institution_id <> me.institution_id
    and left(p.isced_f, 3) = left(me.isced_f, 3)
  order by (p.isced_f = me.isced_f) desc, p.coverage_tier desc, p.title
  limit p_limit;
$$;
revoke all on function public.similar_programs from public;
grant execute on function public.similar_programs to anon, authenticated;
