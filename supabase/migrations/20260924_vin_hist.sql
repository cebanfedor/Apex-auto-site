-- Хранилище истории по VIN: запасной источник, если фид не ответил, и быстрые карточки каталога без запросов к фиду.
create table if not exists public.vin_hist (
  vin        text primary key,
  entries    jsonb not null default '[]'::jsonb,   -- все заходы по VIN (дата, ставка, статус, номер лота)
  latest     jsonb,                                 -- актуальный/ближайший непроданный заход
  sold_n     int not null default 0,
  rounds_n   int not null default 0,
  checked_at timestamptz not null default now()
);
create index if not exists idx_vin_hist_checked on public.vin_hist (checked_at);
alter table public.vin_hist enable row level security;
notify pgrst, 'reload schema';
