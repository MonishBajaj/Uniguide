alter table public.country_rules drop constraint country_rules_kind_check;
alter table public.country_rules add constraint country_rules_kind_check
  check (kind in ('aps_certificate', 'visa_info', 'proof_of_funds', 'visa_step', 'post_study_work', 'work_hours', 'banking', 'other'));
