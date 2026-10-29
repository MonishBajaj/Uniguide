-- Consultancy teams: viewers, and owners who manage their own members.
alter table public.org_members drop constraint org_members_role_check;
alter table public.org_members add constraint org_members_role_check check (role in ('owner', 'counselor', 'viewer'));

create function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner');
$$;
revoke all on function public.is_org_owner from public, anon;
grant execute on function public.is_org_owner to authenticated;

create function public.owner_add_member(p_org uuid, p_email text, p_role text default 'counselor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Only the organisation''s owners can add members' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with that email; ask them to sign up first' using errcode = 'P0002';
  end if;
  insert into public.org_members (org_id, user_id, role) values (p_org, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return v_uid;
end;
$$;

create function public.owner_remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Only the organisation''s owners can remove members' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where org_id = p_org and user_id = p_user and role = 'owner')
     and (select count(*) from public.org_members where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'An organisation needs at least one owner' using errcode = '23514';
  end if;
  delete from public.org_members where org_id = p_org and user_id = p_user;
end;
$$;
revoke all on function public.owner_add_member, public.owner_remove_member from public, anon;
grant execute on function public.owner_add_member, public.owner_remove_member to authenticated;
