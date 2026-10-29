-- 4.8 Waitlist assistant: a letter of continued interest is drafted in the writing coach like any other
-- document, with the same authorship record and the same rule that the coach never writes it.
alter type public.document_kind add value if not exists 'continued_interest';
