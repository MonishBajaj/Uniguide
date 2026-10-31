-- Journey M5 (J5.4): students set intake_rolled_at when they plan for the next intake. Profiles grant updates
-- column by column, and 20270105000001 added the column without one.
grant update (intake_rolled_at) on public.profiles to authenticated;
