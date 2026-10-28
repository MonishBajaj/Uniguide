-- Replaces the stub from 20261101000001: same signature, now returns published waivers
-- of the program's current and future intakes.
create or replace function public.course_fee_waivers(p_program uuid)
returns table (kind text, amount numeric, currency char(3), conditions text, source_url text, status public.fact_status, verified_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.kind, w.amount, w.currency, w.conditions, s.url, w.status, w.verified_at
  from public.fee_waivers w
  join public.program_cycles c on c.id = w.cycle_id
  left join public.sources s on s.id = w.source_id
  where c.program_id = p_program
    and w.published
    and c.intake_year >= extract(year from now())::int
  order by w.kind, w.amount nulls first;
$$;
