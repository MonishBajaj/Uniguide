-- 5.6 Supplemental essay assistant: a school's own short questions, several per application. The
-- coach classifies the question and asks strategy questions; it never writes the answer. The
-- question is the point of the document, so this kind cannot be saved without it.
alter type public.document_kind add value if not exists 'supplemental';

-- Compared as text: a new enum value cannot be used in the transaction that adds it.
alter table public.documents add constraint documents_supplemental_question
  check (kind::text <> 'supplemental' or length(btrim(coalesce(question, ''))) > 0);
