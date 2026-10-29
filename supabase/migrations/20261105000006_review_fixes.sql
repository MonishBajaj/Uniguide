-- Review fixes: a strict official-domain check (no backslash or userinfo tricks, applied to the page link too),
-- and owners can neither demote the last owner nor race each other into an ownerless organisation.
create function public._url_on_domain(p_url text, p_domain text) returns boolean
language sql immutable as $$
  select p_domain is not null and coalesce((
    select h = lower(p_domain) or right(h, length(p_domain) + 1) = '.' || lower(p_domain)
    from (select (regexp_match(lower(p_url), '^https?://([a-z0-9.-]+)(:[0-9]+)?([/?#]|$)'))[1] as h) x
    where h is not null
  ), false);
$$;

create or replace function public.add_institution_fact(
  p_institution uuid, p_kind text, p_title text, p_source_url text, p_quote text,
  p_program uuid default null, p_details text default null, p_amount numeric default null,
  p_currency char(3) default null, p_period text default null, p_hours_per_week integer default null,
  p_link text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_domain text;
begin
  if not public._can_edit_institution(p_institution) then
    raise exception 'Only admins and this country''s verifiers can add facts' using errcode = '42501';
  end if;
  select official_domain into v_domain from public.institutions where id = p_institution;
  if not public._url_on_domain(p_source_url, v_domain) or (p_link is not null and not public._url_on_domain(p_link, v_domain)) then
    raise exception 'The source and the link must be on the institution''s official domain' using errcode = '22023';
  end if;
  if p_program is not null and not exists (select 1 from public.programs where id = p_program and institution_id = p_institution) then
    raise exception 'That course does not belong to this institution' using errcode = '22023';
  end if;
  insert into public.institution_facts (institution_id, program_id, kind, title, details, amount, currency, period,
                                        hours_per_week, link, source_id, evidence_quote)
  values (p_institution, p_program, p_kind, p_title, p_details, p_amount, p_currency, p_period, p_hours_per_week,
          coalesce(p_link, p_source_url), public._admin_source(p_source_url, 'Official page'), p_quote)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.owner_add_member(p_org uuid, p_email text, p_role text default 'counselor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Only the organisation''s owners can add members' using errcode = '42501';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email; ask them to sign up first' using errcode = 'P0002';
  end if;
  if p_role <> 'owner'
     and exists (select 1 from public.org_members where org_id = p_org and user_id = v_uid and role = 'owner')
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'An organisation needs at least one owner' using errcode = '23514';
  end if;
  insert into public.org_members (org_id, user_id, role) values (p_org, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return v_uid;
end;
$$;

create or replace function public.owner_remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Only the organisation''s owners can remove members' using errcode = '42501';
  end if;
  perform 1 from public.organizations where id = p_org for update;
  if exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'An organisation needs at least one owner' using errcode = '23514';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
end;
$$;
revoke all on function public._url_on_domain from public, anon, authenticated;
