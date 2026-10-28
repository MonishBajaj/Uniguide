-- Local development only. Never run against a hosted project.

-- Password for the ingest worker role (hosted: set a strong one, see docs/SETUP.md).
alter role ingest_worker with login password 'ingest_worker_local';

-- Confirmed users: an admin reviewer, a student, a Germany verifier, a consultancy counselor and the student's parent.
-- Password for all: password123
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'admin@uniguide.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"birth_month":"1990-01","residence_country":"US"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'student@uniguide.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"birth_month":"2003-06","residence_country":"IN"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated',
   'verifier@uniguide.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"birth_month":"1992-03","residence_country":"DE"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'counselor@uniguide.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"birth_month":"1988-09","residence_country":"IN"}', now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated',
   'parent@uniguide.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"birth_month":"1975-04","residence_country":"IN"}', now(), now(),
   '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@uniguide.local';

insert into public.admins (user_id) values ('00000000-0000-4000-a000-000000000001');
insert into public.verifiers (user_id, display_name, countries) values ('00000000-0000-4000-a000-000000000003', 'Local verifier', '{DE}');
insert into public.parent_links (parent_id, student_id, student_name, parent_name)
values ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000002', 'Local student', 'Local parent');
insert into public.organizations (id, name, country, invite_code)
values ('00000000-0000-4000-b000-000000000001', 'Example Consultancy (local)', 'IN', 'local-agency');
insert into public.org_members (org_id, user_id, role)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004', 'owner');
-- Local password for the notifier role (hosted: see docs/SETUP.md).
alter role notifier with login password 'notifier_local';

-- Local password for the analyst role (hosted: see docs/SETUP.md).
alter role analyst with login password 'analyst_local';
