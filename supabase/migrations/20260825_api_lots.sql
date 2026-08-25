-- Локальная база лотов (модель DreamBid / официальная схема интеграции auctionsapi.com):
-- полный каталог синхронизируется в Supabase (/cars постранично, затем ?minutes=NN
-- + /archived-lots), а поиск, фильтры и сортировка выполняются по SQL на всём каталоге.
-- Выполнить в Supabase SQL Editor.

create table if not exists public.api_lots (
  id              text primary key,          -- copart-<lot> / iaai-<lot>
  auction         text not null,             -- copart | iaai
  lot             text not null,
  vin             text,
  title           text,
  year            int,
  make_id         int,
  model_id        int,
  generation_id   int,
  vehicle_type_id int,
  body_id         int,
  color_id        int,
  fuel_id         int,
  transmission_id int,
  drive_id        int,
  condition_id    int,
  cylinders       int,
  damage          text,
  document        text,
  state_code      text,
  country         text,
  odometer_mi     int,
  current_bid     int,
  buy_now         int,
  final_bid       int,
  sale_date       timestamptz,
  status_id       int,
  archived        boolean not null default false,
  payload         jsonb not null,            -- нормализованный лот (тот же вид, что отдаёт action=search)
  synced_at       timestamptz not null default now()
);

create index if not exists idx_api_lots_sale    on public.api_lots (archived, sale_date);
create index if not exists idx_api_lots_makemod on public.api_lots (make_id, model_id);
create index if not exists idx_api_lots_bid     on public.api_lots (current_bid);
create index if not exists idx_api_lots_year    on public.api_lots (year);
create index if not exists idx_api_lots_odo     on public.api_lots (odometer_mi);
create index if not exists idx_api_lots_vin     on public.api_lots (vin);
create index if not exists idx_api_lots_lot     on public.api_lots (lot);
create index if not exists idx_api_lots_status  on public.api_lots (status_id);
create index if not exists idx_api_lots_synced  on public.api_lots (synced_at);

-- RLS: доступ только по service_role ключу (в браузер не попадает).
alter table public.api_lots enable row level security;

-- Прогресс синхронизации (фаза full/incr, номер страницы, метки времени, лок).
create table if not exists public.api_sync_state (
  k          text primary key,
  v          jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.api_sync_state enable row level security;
