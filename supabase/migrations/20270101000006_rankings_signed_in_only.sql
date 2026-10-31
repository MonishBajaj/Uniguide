-- Rankings are only read by search_programs on behalf of signed-in students; visitors with the public key should
-- not be able to download the QS table (docs/DATA_SOURCES.md: never redistributed).
drop policy "public read" on public.institution_rankings;
create policy "signed-in read" on public.institution_rankings for select to authenticated using (true);
