-- Объявления «Продажа авто в пути»: поля таблицы vehicles (идемпотентно).
-- В проде не было как минимум колонки photos → /api/hot-lots отдавал пустой список.
alter table public.vehicles
  add column if not exists vin text,
  add column if not exists lot text,
  add column if not exists year integer,
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists description text,
  add column if not exists price numeric,
  add column if not exists status text default 'Рекомендуется',
  add column if not exists photos text[] default '{}',
  add column if not exists auction text,
  add column if not exists auction_url text,
  add column if not exists mileage text,
  add column if not exists damage text,
  add column if not exists fuel text,
  add column if not exists engine text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();
create index if not exists idx_vehicles_status on public.vehicles (status);
notify pgrst, 'reload schema';
