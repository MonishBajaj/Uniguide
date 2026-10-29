-- Schools follow the students who share with them, under the same consent-based sharing as consultancies.
alter table public.organizations add column kind text not null default 'consultancy' check (kind in ('consultancy', 'school'));
