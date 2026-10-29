-- 6.3 Brag sheet: the points a student asks a recommender to mention, kept with the recommender.
-- The printable sheet is built from these notes, the student's CV entries and the applications this
-- person writes for. The student writes every word; there is no AI here.
alter table public.recommenders add column brag_notes text check (length(brag_notes) <= 3000);
