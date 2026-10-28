-- Season passes. The web app holds no Supabase secret key, so payment webhooks call record_payment with a
-- shared token whose hash is stored in payment_config, a table nobody can read directly.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind = 'season_pass'),
  provider text not null check (provider in ('stripe', 'razorpay', 'admin')),
  external_id text not null,
  amount numeric not null check (amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index entitlements_user_idx on public.entitlements (user_id);
alter table public.entitlements enable row level security;
create policy "own entitlements" on public.entitlements for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

create table public.payment_config (
  id boolean primary key default true check (id),
  webhook_token_hash text not null,
  pass_months smallint not null default 12 check (pass_months between 1 and 60)
);
alter table public.payment_config enable row level security;
revoke all on public.payment_config from anon, authenticated;

-- Called by the payment webhooks (no user session). Idempotent on (provider, external_id).
create function public.record_payment(
  p_token text, p_provider text, p_external_id text, p_user_id uuid, p_amount numeric, p_currency char(3)
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_config public.payment_config;
  v_id uuid;
begin
  select * into v_config from public.payment_config;
  if not found or encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') <> v_config.webhook_token_hash then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.entitlements (user_id, kind, provider, external_id, amount, currency, ends_at)
  values (p_user_id, 'season_pass', p_provider, p_external_id, p_amount, p_currency,
          now() + make_interval(months => v_config.pass_months))
  on conflict (provider, external_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.entitlements where provider = p_provider and external_id = p_external_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.record_payment from public;
grant execute on function public.record_payment to anon, authenticated;

create function public.refund_payment(p_entitlement uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can refund' using errcode = '42501';
  end if;
  update public.entitlements set refunded_at = coalesce(refunded_at, now()) where id = p_entitlement;
end;
$$;
revoke all on function public.refund_payment from public, anon;
grant execute on function public.refund_payment to authenticated;
