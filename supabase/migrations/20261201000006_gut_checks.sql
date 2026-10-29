-- 7.7 Decision-day timer: the coin-flip gut check keeps the student's reactions with their private
-- decision matrix ([{application_id, reaction, at}]), at most 50.
alter table public.decision_matrices
  add column gut_checks jsonb not null default '[]'
    check (jsonb_typeof(gut_checks) = 'array' and jsonb_array_length(gut_checks) <= 50);
