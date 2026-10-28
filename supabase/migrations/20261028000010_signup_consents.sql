-- Record the terms and privacy acceptance given at sign-up in the same transaction that creates
-- the account, so no account exists without them.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_birth_month date;
  v_country text := upper(new.raw_user_meta_data ->> 'residence_country');
  v_policy text := new.raw_user_meta_data ->> 'accepted_policy_version';
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

  if v_policy is not null then
    insert into public.consents (user_id, kind, policy_version, method)
    values (new.id, 'terms', v_policy, 'checkbox'), (new.id, 'privacy', v_policy, 'checkbox');
  end if;
  return new;
end;
$$;
