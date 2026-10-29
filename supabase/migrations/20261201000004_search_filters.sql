-- 3.4 Explore filters: "deadline still open" and "published yearly tuition up to" (per-year fees, or
-- per-term and per-month fees turned into a year; per-credit and whole-course fees need the student's
-- credits or duration and are left to matching). Both look only at
-- the current intake's published facts, and a course whose deadline or yearly tuition is unknown is
-- left out when the filter is on, rather than guessed.

-- Converts with the latest stored rate (direct or inverse); null when no rate exists.
create function public.fx_convert(p_amount numeric, p_from char(3), p_to char(3)) returns numeric
language sql stable set search_path = '' as $$
  select case
    when p_from = p_to then p_amount
    else coalesce(
      (select p_amount * r.rate from public.fx_rates r where r.base = p_from and r.quote = p_to order by r.as_of desc limit 1),
      (select p_amount / r.rate from public.fx_rates r where r.base = p_to and r.quote = p_from order by r.as_of desc limit 1)
    )
  end;
$$;

drop function public.search_programs(text, public.program_level[], text[], text[], public.delivery_mode[], integer, integer);

create function public.search_programs(
  p_query text default null,
  p_levels public.program_level[] default null,
  p_countries text[] default null,
  p_fields text[] default null,
  p_delivery public.delivery_mode[] default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_deadline_open boolean default false,
  p_max_tuition numeric default null,
  p_tuition_currency char(3) default null
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
  order by c.coverage_tier desc, c.institution_name, c.title
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;
