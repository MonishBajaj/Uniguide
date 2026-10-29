-- 5.7 Research statement workshop: a research statement for a research master's or doctorate is a
-- document like any other, with the same authorship record and the same rule that the coach never
-- writes it.
alter type public.document_kind add value if not exists 'research_statement';
