-- 4.6 Application cost tracker: what the student has paid while applying (application fees, score
-- sending, exams, deposits), optionally tied to one application. Private to the student.

create table public.application_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  kind text not null check (kind in ('application_fee', 'score_send', 'exam', 'deposit', 'other')),
  amount numeric not null check (amount > 0 and amount < 1000000),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_on date,
  note text check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index application_costs_user_idx on public.application_costs (user_id, paid_on);

alter table public.application_costs enable row level security;
revoke all on public.application_costs from anon;

create function public.owns_application(p_application uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_application is null
      or exists (select 1 from public.applications a where a.id = p_application and a.user_id = auth.uid());
$$;
revoke all on function public.owns_application from public, anon;
grant execute on function public.owns_application to authenticated;

create policy "own rows" on public.application_costs for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows insert" on public.application_costs for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id) and public.owns_application(application_id));
create policy "own rows update" on public.application_costs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_process_personal_data(user_id) and public.owns_application(application_id));
create policy "own rows delete" on public.application_costs for delete to authenticated using (user_id = (select auth.uid()));
