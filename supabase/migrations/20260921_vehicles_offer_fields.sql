-- Объявления «Продажа авто в пути»: что входит в цену, оценка ремонта, ожидаемая дата в Кишинёве.
alter table public.vehicles
  add column if not exists price_includes text,
  add column if not exists repair_estimate numeric,
  add column if not exists eta_date date;
notify pgrst, 'reload schema';
