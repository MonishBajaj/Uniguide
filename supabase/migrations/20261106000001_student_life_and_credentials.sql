alter table public.country_rules drop constraint country_rules_kind_check;
alter table public.country_rules add constraint country_rules_kind_check
  check (kind in ('aps_certificate', 'visa_info', 'proof_of_funds', 'visa_step', 'post_study_work', 'work_hours',
                  'banking', 'credential_evaluation', 'other'));

alter table public.institution_facts drop constraint institution_facts_kind_check;
alter table public.institution_facts add constraint institution_facts_kind_check
  check (kind in ('assistantship', 'on_campus_work', 'housing_on_campus', 'housing_off_campus', 'transit_pass', 'parking',
                  'airport', 'arrival_support', 'course_registration', 'health_insurance',
                  'international_office', 'student_societies', 'faith_and_culture_facilities'));
