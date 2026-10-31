-- search_programs, third form. Two fixes over 20270101000004:
--  * the per-institution window is only computed when a cap is given, so the public explore page (no cap) is as
--    fast as before; the two branches differ only in that window;
--  * only the newest ranking edition is used, and courses that tie on everything else come back in id order.
create or replace function public.search_programs(
  p_query text default null,
  p_levels public.program_level[] default null,
  p_countries text[] default null,
  p_fields text[] default null,
  p_delivery public.delivery_mode[] default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_deadline_open boolean default false,
  p_max_tuition numeric default null,
  p_tuition_currency char(3) default null,
  p_rank_subjects text[] default null,
  p_per_institution integer default null
) returns setof public.program_cards
language plpgsql stable set search_path = '' as $$
begin
  if p_per_institution is null then
    return query
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
      -- An application deadline in the current intake that has not closed. A date-only deadline runs to
      -- the end of that day, a month-only one to the end of the month (as in packages/matching).
      and (not coalesce(p_deadline_open, false) or exists (
        select 1 from public.deadlines d join public.program_cycles pc on pc.id = d.cycle_id
        where pc.program_id = p.id and pc.is_current and d.published and d.kind in ('application', 'priority')
          and case d.precision
                when 'date' then d.due_at + interval '1 day'
                when 'month' then date_trunc('month', d.due_at) + interval '1 month'
                else d.due_at
              end > now()
      ))
      and (p_max_tuition is null or p_tuition_currency is null or exists (
        select 1 from public.cost_items k join public.program_cycles pc on pc.id = k.cycle_id
        where pc.program_id = p.id and pc.is_current and k.published and k.mandatory
          and k.kind = 'tuition' and k.basis in ('per_year', 'per_term', 'per_month')
          -- Yearly amount; two terms a year, as TERMS_PER_YEAR in packages/matching/src/cost.ts.
          and public.fx_convert(
                k.base * case k.basis when 'per_term' then 2 when 'per_month' then 12 else 1 end,
                k.currency, p_tuition_currency
              ) <= p_max_tuition
      ))
    order by c.coverage_tier desc,
             case when p_rank_subjects is null or cardinality(p_rank_subjects) = 0 then null else (
             select min(r.rank_low) from public.institution_rankings r
             where r.institution_id = c.institution_id and r.subject = any (p_rank_subjects)
               and r.edition = (select max(e.edition) from public.institution_rankings e)
           ) end nulls last,
             c.institution_name, c.title, c.id
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
  else
    return query
    select (t.card).*
    from (
      select c as card,
             case when p_rank_subjects is null or cardinality(p_rank_subjects) = 0 then null else (
             select min(r.rank_low) from public.institution_rankings r
             where r.institution_id = c.institution_id and r.subject = any (p_rank_subjects)
               and r.edition = (select max(e.edition) from public.institution_rankings e)
           ) end as best_rank,
             row_number() over (partition by c.institution_id order by c.coverage_tier desc, c.title, c.id) as rn
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
      -- An application deadline in the current intake that has not closed. A date-only deadline runs to
      -- the end of that day, a month-only one to the end of the month (as in packages/matching).
      and (not coalesce(p_deadline_open, false) or exists (
        select 1 from public.deadlines d join public.program_cycles pc on pc.id = d.cycle_id
        where pc.program_id = p.id and pc.is_current and d.published and d.kind in ('application', 'priority')
          and case d.precision
                when 'date' then d.due_at + interval '1 day'
                when 'month' then date_trunc('month', d.due_at) + interval '1 month'
                else d.due_at
              end > now()
      ))
      and (p_max_tuition is null or p_tuition_currency is null or exists (
        select 1 from public.cost_items k join public.program_cycles pc on pc.id = k.cycle_id
        where pc.program_id = p.id and pc.is_current and k.published and k.mandatory
          and k.kind = 'tuition' and k.basis in ('per_year', 'per_term', 'per_month')
          -- Yearly amount; two terms a year, as TERMS_PER_YEAR in packages/matching/src/cost.ts.
          and public.fx_convert(
                k.base * case k.basis when 'per_term' then 2 when 'per_month' then 12 else 1 end,
                k.currency, p_tuition_currency
              ) <= p_max_tuition
      ))
    ) t
    where t.rn <= p_per_institution
    order by (t.card).coverage_tier desc, t.best_rank nulls last, (t.card).institution_name, (t.card).title, (t.card).id
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
  end if;
end;
$$;
