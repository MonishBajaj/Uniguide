-- Country rules gain typed numbers so pages can compute from them instead of reading free text.
alter table public.country_rules
  add column amount numeric check (amount >= 0),
  add column currency char(3) check (currency ~ '^[A-Z]{3}$'),
  add column period text check (period in ('per_month', 'per_year', 'total')),
  add column months smallint check (months between 1 and 120),
  add column hours_per_week smallint check (hours_per_week between 1 and 80),
  add column region text,                    -- for example 'london'; null means the whole country
  add column step smallint check (step >= 0); -- order within a visa checklist

alter table public.country_rules drop constraint country_rules_kind_check;
alter table public.country_rules add constraint country_rules_kind_check
  check (kind in ('aps_certificate', 'visa_info', 'proof_of_funds', 'visa_step', 'post_study_work', 'work_hours', 'other'));

alter table public.country_rules add constraint country_rules_typed_check check (
  (amount is null or (currency is not null and period is not null))
  and (kind <> 'post_study_work' or months is not null)
  and (kind <> 'work_hours' or hours_per_week is not null)
);

drop function public.add_country_rule(char, text, text, text, text, char[], text, text);
create function public.add_country_rule(
  p_destination char(2), p_kind text, p_title text, p_source_url text, p_quote text,
  p_applies_to char(2)[] default '{}', p_details text default null, p_link text default null,
  p_amount numeric default null, p_currency char(3) default null, p_period text default null,
  p_months integer default null, p_hours_per_week integer default null, p_region text default null,
  p_step integer default null
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
  insert into public.country_rules (destination, applies_to, kind, title, details, link, source_id, evidence_quote,
                                    amount, currency, period, months, hours_per_week, region, step)
  values (upper(p_destination), p_applies_to, p_kind, p_title, p_details, coalesce(p_link, p_source_url),
          public._admin_source(p_source_url, 'Official page'), p_quote,
          p_amount, p_currency, p_period, p_months, p_hours_per_week, nullif(trim(lower(p_region)), ''), p_step)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_country_rule from public, anon;
grant execute on function public.add_country_rule to authenticated;
