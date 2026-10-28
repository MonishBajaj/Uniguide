-- Age below which a parent must consent. Issue-spotting from the plan, not legal advice:
-- have counsel confirm these before launch (BACKLOG.md). Unlisted countries use 13.
insert into public.consent_age_rules (country, parental_consent_below, basis) values
  ('US', 13, 'COPPA'),
  ('IN', 18, 'DPDP Act 2023: verifiable parental consent under 18'),
  ('GB', 13, 'UK GDPR / Data Protection Act 2018 s.9'),
  -- EEA: GDPR Art. 8, each member state sets 13-16
  ('BE', 13, 'GDPR Art. 8 (Belgium)'), ('DK', 13, 'GDPR Art. 8 (Denmark)'), ('EE', 13, 'GDPR Art. 8 (Estonia)'),
  ('FI', 13, 'GDPR Art. 8 (Finland)'), ('LV', 13, 'GDPR Art. 8 (Latvia)'), ('MT', 13, 'GDPR Art. 8 (Malta)'),
  ('PT', 13, 'GDPR Art. 8 (Portugal)'), ('SE', 13, 'GDPR Art. 8 (Sweden)'), ('NO', 13, 'GDPR Art. 8 (Norway)'),
  ('IS', 13, 'GDPR Art. 8 (Iceland)'),
  ('AT', 14, 'GDPR Art. 8 (Austria)'), ('BG', 14, 'GDPR Art. 8 (Bulgaria)'), ('CY', 14, 'GDPR Art. 8 (Cyprus)'),
  ('IT', 14, 'GDPR Art. 8 (Italy)'), ('LT', 14, 'GDPR Art. 8 (Lithuania)'), ('ES', 14, 'GDPR Art. 8 (Spain)'),
  ('CZ', 15, 'GDPR Art. 8 (Czechia)'), ('FR', 15, 'GDPR Art. 8 (France)'), ('GR', 15, 'GDPR Art. 8 (Greece)'),
  ('SI', 15, 'GDPR Art. 8 (Slovenia)'),
  ('DE', 16, 'GDPR Art. 8 default (Germany)'), ('HR', 16, 'GDPR Art. 8 (Croatia)'), ('HU', 16, 'GDPR Art. 8 (Hungary)'),
  ('IE', 16, 'GDPR Art. 8 (Ireland)'), ('LI', 16, 'GDPR Art. 8 (Liechtenstein)'), ('LU', 16, 'GDPR Art. 8 (Luxembourg)'),
  ('NL', 16, 'GDPR Art. 8 (Netherlands)'), ('PL', 16, 'GDPR Art. 8 (Poland)'), ('RO', 16, 'GDPR Art. 8 (Romania)'),
  ('SK', 16, 'GDPR Art. 8 (Slovakia)');
