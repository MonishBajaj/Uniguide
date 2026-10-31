-- Journey M4 (J4.3): journey emails. The weekly digest for a student with a recent journey, and one
-- email when the student reaches stage 4, 6 or 7, are logged in lifecycle_log like the other lifecycle
-- emails, so a repeated run sends nothing twice. The notifier reads journey_events to find stage changes.

alter table public.lifecycle_log drop constraint lifecycle_log_kind_check;
alter table public.lifecycle_log add constraint lifecycle_log_kind_check
  check (kind in ('welcome_1', 'welcome_2', 'welcome_3', 'digest', 'reengage', 'journey_digest', 'stage_change'));

grant select on public.journey_events to notifier;
create policy "notifier" on public.journey_events for select to notifier using (true);
