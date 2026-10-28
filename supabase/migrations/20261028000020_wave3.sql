-- Wave 3 destinations: official government pages only. Gulf links are added through the admin
-- rules page once a reviewer has checked the current official page.
insert into public.country_rules (destination, kind, title, link) values
  ('SG', 'visa_info', 'Student''s Pass (Immigration & Checkpoints Authority)', 'https://www.ica.gov.sg/reside/STP'),
  ('JP', 'visa_info', 'Study in Japan (JASSO, supported by the Ministry of Education)', 'https://www.studyinjapan.go.jp/en/'),
  ('KR', 'visa_info', 'Study in Korea (NIIED, Ministry of Education)', 'https://www.studyinkorea.go.kr/');
