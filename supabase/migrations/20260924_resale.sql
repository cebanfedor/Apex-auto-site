-- Feduk SmartSelect: пометка «перекупских» лотов (0 чистый · 1 многократно выставлялся · 2 уже продавался).
alter table public.api_lots add column if not exists resale smallint;
alter table public.api_lots add column if not exists resale_at timestamptz;
notify pgrst, 'reload schema';
-- Отдельным запуском после этого:
-- create index concurrently if not exists idx_lots_resale_todo on public.api_lots (sale_date) where archived = false and resale_at is null and vin is not null;
