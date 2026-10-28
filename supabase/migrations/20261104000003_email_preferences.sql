-- What lifecycle email a student wants. Deadline reminders are separate (profiles.reminders_enabled).
create table public.email_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  digest boolean not null default true,
  tips boolean not null default true,
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);
alter table public.email_preferences enable row level security;
create policy "own preferences" on public.email_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "update own preferences" on public.email_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.email_preferences from anon, authenticated;
grant select on public.email_preferences to authenticated;
grant update (digest, tips) on public.email_preferences to authenticated;

insert into public.email_preferences (user_id) select id from auth.users on conflict do nothing;

create function public.create_email_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.email_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created_email_preferences after insert on auth.users
  for each row execute function public.create_email_preferences();

-- One-click unsubscribe from an emailed link. The token is the credential, so no session is needed.
create function public.unsubscribe(p_token text, p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_found boolean;
begin
  if p_kind not in ('digest', 'tips', 'all') then
    raise exception 'Unknown email kind' using errcode = '22023';
  end if;
  update public.email_preferences
    set digest = case when p_kind in ('digest', 'all') then false else digest end,
        tips = case when p_kind in ('tips', 'all') then false else tips end,
        updated_at = now()
    where unsubscribe_token = p_token;
  v_found := found;
  return v_found;
end;
$$;
revoke all on function public.unsubscribe from public;
grant execute on function public.unsubscribe to anon, authenticated;
