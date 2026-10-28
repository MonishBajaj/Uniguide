-- Contracts for apps/web. The signatures are final; the bodies change later:
-- my_entitlement in the payments milestone, course_fee_waivers when fee waivers become facts.

-- 'none' for visitors, 'free' for any signed-in user. Later: 'season_pass'.
create function public.my_entitlement() returns text
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then 'none' else 'free' end;
$$;

-- Fee waivers for a course. kind is later one of 'automatic', 'event', 'need_based', 'on_request';
-- a null amount means the whole application fee is waived.
create function public.course_fee_waivers(p_program uuid)
returns table (kind text, amount numeric, currency char(3), conditions text, source_url text, status public.fact_status, verified_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select null::text, null::numeric, null::char(3), null::text, null::text, null::public.fact_status, null::timestamptz
  where false;
$$;

revoke all on function public.my_entitlement, public.course_fee_waivers from public;
grant execute on function public.my_entitlement, public.course_fee_waivers to anon, authenticated;
