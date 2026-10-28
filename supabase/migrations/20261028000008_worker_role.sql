-- The ingest worker connects as its own Postgres role instead of the service-role key, so a
-- leaked worker credential cannot read student data. Its password is set out of band
-- (seed.sql locally, docs/SETUP.md when hosted).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ingest_worker') then
    create role ingest_worker nologin noinherit;
  end if;
end
$$;

-- Lets the migration owner (and pgTAP tests) act as the worker with SET ROLE.
grant ingest_worker to postgres;

grant usage on schema public to ingest_worker;
grant usage on schema extensions to ingest_worker;

grant select, insert, update on public.sources, public.ingest_runs, public.institutions, public.programs,
  public.program_cycles, public.fx_rates to ingest_worker;
grant select, insert on public.fetch_log, public.fact_versions to ingest_worker;
grant select on public.requirements, public.deadlines, public.cost_items, public.consent_age_rules to ingest_worker;
grant select, insert on public.ai_runs to ingest_worker;
grant execute on function public.publish_extracted_version(uuid) to ingest_worker;

create policy "worker" on public.sources for all to ingest_worker using (true) with check (true);
create policy "worker" on public.ingest_runs for all to ingest_worker using (true) with check (true);
create policy "worker" on public.fetch_log for all to ingest_worker using (true) with check (true);
create policy "worker" on public.institutions for all to ingest_worker using (true) with check (true);
create policy "worker" on public.programs for all to ingest_worker using (true) with check (true);
create policy "worker" on public.program_cycles for all to ingest_worker using (true) with check (true);
create policy "worker" on public.fx_rates for all to ingest_worker using (true) with check (true);
create policy "worker read" on public.requirements for select to ingest_worker using (true);
create policy "worker read" on public.deadlines for select to ingest_worker using (true);
create policy "worker read" on public.cost_items for select to ingest_worker using (true);
create policy "worker read" on public.consent_age_rules for select to ingest_worker using (true);
-- The worker proposes versions; it can never mark one approved.
create policy "worker read" on public.fact_versions for select to ingest_worker using (true);
create policy "worker propose" on public.fact_versions for insert to ingest_worker
  with check (review_state in ('pending', 'auto_rejected') and reviewed_by is null and created_by = 'worker');
create policy "worker runs" on public.ai_runs for all to ingest_worker using (user_id is null) with check (user_id is null);
