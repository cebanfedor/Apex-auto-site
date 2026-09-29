-- Кулдаун для buynowcheck (аудит расхода API 30.09.2026).
-- Раньше крон по кругу ВЕЧНО перепроверял одни и те же buy-now лоты (250×/search-lot за тик).
-- С этой колонкой крон помечает проверенный лот и не трогает его ~6ч → после первого прохода
-- тратит запросы только на новые/подгоревшие лоты. Без колонки код работает по-старому (курсор).
alter table public.api_lots add column if not exists bn_checked_at timestamptz;

-- Частичный индекс под выборку крона (buy-now, активные, не проданные) по дате торгов.
create index if not exists idx_lots_bn_todo
  on public.api_lots (sale_date)
  where buy_now > 0 and archived = false and status_id is distinct from 6;

analyze public.api_lots;
