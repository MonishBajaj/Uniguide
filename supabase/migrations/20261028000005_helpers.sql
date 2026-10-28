-- Helper functions and triggers used by RLS policies and RPCs.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger institutions_updated_at before update on public.institutions for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.programs for each row execute function public.set_updated_at();
create trigger requirements_updated_at before update on public.requirements for each row execute function public.set_updated_at();
create trigger deadlines_updated_at before update on public.deadlines for each row execute function public.set_updated_at();
create trigger cost_items_updated_at before update on public.cost_items for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- A direct postgres connection (migrations, seed loader run by the operator), not an API request.
create function public.is_operator() returns boolean
language sql stable set search_path = '' as $$
  select session_user = 'postgres' and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres');
$$;

create function public.can_process_personal_data(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.consent_state in ('not_required', 'granted') from public.profiles p where p.user_id = uid),
    false
  );
$$;

-- Only the birth month is known, so assume the birthday is the last day of that month.
-- This errs towards the younger age, which is the safe side for consent.
create function public.age_in_years(p_birth_month date, p_on date default current_date) returns integer
language sql stable set search_path = '' as $$
  select extract(year from age(p_on, (date_trunc('month', p_birth_month) + interval '1 month - 1 day')::date))::integer;
$$;

create function public.age_band_for(p_age integer) returns public.age_band
language sql immutable set search_path = '' as $$
  select case
    when p_age < 13 then 'under_13'::public.age_band
    when p_age < 16 then 'age_13_15'::public.age_band
    when p_age < 18 then 'age_16_17'::public.age_band
    else 'adult'::public.age_band
  end;
$$;

create function public.parental_consent_age(p_country text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.parental_consent_below from public.consent_age_rules r where r.country = upper(p_country)),
    13
  );
$$;

-- Creates the profile when Supabase Auth creates a user. The sign-up server action already
-- blocks under-13s; this is the database-side backstop.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_birth_month date;
  v_country text := upper(new.raw_user_meta_data ->> 'residence_country');
  v_age integer;
begin
  begin
    v_birth_month := to_date(new.raw_user_meta_data ->> 'birth_month', 'YYYY-MM');
  exception when others then
    v_birth_month := null;
  end;
  if v_birth_month is null or v_country is null or v_country !~ '^[A-Z]{2}$' then
    raise exception 'birth_month (YYYY-MM) and residence_country are required to create an account';
  end if;

  v_age := public.age_in_years(v_birth_month);
  if v_age < 13 then
    raise exception 'Accounts are not available to children under 13';
  end if;

  insert into public.profiles (user_id, birth_month, residence_country, age_band, consent_state)
  values (
    new.id,
    v_birth_month,
    v_country,
    public.age_band_for(v_age),
    case when v_age < public.parental_consent_age(v_country)
      then 'pending_parental'::public.consent_state
      else 'not_required'::public.consent_state
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
