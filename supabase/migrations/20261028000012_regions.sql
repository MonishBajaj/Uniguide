-- State or province, so a deadline page that gives a date without a time zone can be placed in
-- the institution's own zone (Toronto vs Vancouver, Sydney vs Perth).
alter table public.institutions
  add column region text check (region ~ '^[A-Z0-9]{1,3}$');
