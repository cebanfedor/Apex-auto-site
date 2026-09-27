-- Индексы под фоновую заливку fuel_x/vin_trim для АРХИВНЫХ (уже проданных) лотов (27.09.2026).
-- Очередь `runPowertrainFill` раньше брала только archived=false (живые/ближайшие лоты) — у архива
-- (174k+ проданных, именно он и есть пул для «Ориентира ставки» по похожим продажам) fuel_x почти не
-- заполнен, из-за чего оценка гибридов/plug-in там опиралась на сырой fuel_id фида, а не на VIN.
-- Без частичного индекса запрос "archived=true AND fuel_x/vin_trim is null" идёт последовательным
-- сканированием всей таблицы — на Supabase Micro это медленно/таймаутится.
create index if not exists idx_lots_vintrim_archived_todo
  on public.api_lots (sale_date desc)
  where vin_trim is null and archived = true;

create index if not exists idx_lots_fuelx_archived_todo
  on public.api_lots (sale_date desc)
  where fuel_x is null and archived = true;

analyze public.api_lots;
