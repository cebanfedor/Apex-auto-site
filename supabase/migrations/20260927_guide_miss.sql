-- Самодиагностика «Ориентира ставки» (27.09.2026, Федор): каждый раз, когда реальная ставка/резерв
-- продавца/прошлый раунд торгов оказываются выше верха вилки ("рынок опроверг ориентир"), сохраняем
-- диагностическую строку — марка/модель/год/поколение/топливо/пробег/состояние/повреждение/документ/
-- локация/штат/ACV/источник оценки/саму вилку/наблюдаемое значение. Одна строка на лот (upsert по
-- lot_id) — повторные заходы того же лота просто обновляют seen_at и наблюдаемое значение, таблица не
-- растёт бесконечно. Цель — периодически смотреть, где формула систематически занижает (по штату,
-- марке, топливу и т.п.), и точечно править коэффициенты в server/price-guide.js.
-- ⚠️ Сюда НЕ пишем ничего из закрытой таблицы price_guide (base_price/K) — только уже публичные band_lo/hi.
create table if not exists public.guide_miss (
  lot_id text primary key,
  auction text,
  make text,
  model text,
  make_id int,
  model_id int,
  year int,
  generation text,
  fuel text,
  odometer int,
  condition text,
  damage text,
  damage2 text,
  document text,
  state_code text,
  location text,
  acv numeric,
  src text,
  band_lo numeric,
  band_hi numeric,
  observed_value numeric,
  observed_source text,
  delta_pct numeric,
  seen_at timestamptz not null default now()
);
create index if not exists idx_guide_miss_model on public.guide_miss (make_id, model_id);
create index if not exists idx_guide_miss_seen on public.guide_miss (seen_at desc);
notify pgrst, 'reload schema';
