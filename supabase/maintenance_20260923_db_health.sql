-- Диагностика и лечение медленной базы лотов (23.09.2026).
-- Запускать в Supabase → SQL Editor по блокам. Ничего не удаляет.

-- 1) Сколько «мёртвых» строк накопилось после чистки ~300k лотов (если n_dead_tup сравним с n_live_tup — база тормозит из-за них)
select relname, n_live_tup, n_dead_tup, last_autovacuum, last_vacuum, last_autoanalyze
from pg_stat_user_tables
where relname in ('api_lots','api_cache','api_sync_state')
order by relname;

-- 2) Размер таблицы и индексов (индексов у api_lots много — каждая запись лота обновляет их все)
select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size, idx_scan
from pg_stat_user_indexes where relname = 'api_lots' order by pg_relation_size(indexrelid) desc;
select pg_size_pretty(pg_total_relation_size('public.api_lots')) as api_lots_total;

-- 3) Лимиты времени запроса по ролям (ошибка «canceling statement due to statement timeout»)
select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated','service_role','authenticator');

-- 4) ЛЕЧЕНИЕ: убрать мёртвые строки и обновить статистику. Таблицу не блокирует, сайт работает. Может идти несколько минут.
vacuum (analyze, verbose) public.api_lots;
vacuum (analyze) public.api_cache;
vacuum (analyze) public.api_sync_state;

-- 5) Дать сервисной роли (наш синк) больше времени на запись: 60с вместо стандартных 8с.
-- Действует на новые подключения. Пользовательские роли (anon/authenticated) не трогаем.
alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';

-- 6) Индексы без единого использования — кандидаты на удаление (запись станет легче). Сначала посмотреть idx_scan в п.2,
--    удалять только те, где idx_scan = 0 ПОСЛЕ нескольких дней работы:
-- drop index concurrently if exists public.idx_api_lots_bid;
-- drop index concurrently if exists public.idx_api_lots_lot;

-- 7) (23.09, ночь) Вкладка «Купить сейчас» и её счётчик: частичный индекс под Buy Now-лоты.
--    Запускать ОДНОЙ командой в пустом редакторе (CONCURRENTLY, как и VACUUM, не работает в транзакции). ~1–3 мин.
create index concurrently if not exists idx_lots_buynow_act
  on public.api_lots (sale_date, id) where archived = false and buy_now > 0;

-- 8) (23.09, 01:30) Лимит времени запроса для сервисной роли: 60с оказалось МНОГО — брошенные клиентом (8с-аборт) тяжёлые
--    запросы продолжали жить до 60с и занимали пул соединений PostgREST (на Micro он маленький), остальные запросы ждали.
--    Синку хватает 15с (пачки по 100 строк пишутся за 1–4с).
alter role service_role set statement_timeout = '15s';
notify pgrst, 'reload config';

-- 9) (23.09, 02:00) Что сейчас висит в базе: активные/ожидающие запросы. Если есть строки старше минуты в state='active'
--    или 'idle in transaction' — это и тормозит всё остальное. Их можно снять (п.10).
select pid, now() - query_start as age, state, wait_event_type, wait_event, left(query, 100) as query
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid() and state <> 'idle'
order by age desc;

-- 10) Снять зависшие (подставить pid из п.9). Безопасно: это только наши запросы синка/каталога, они повторятся.
-- select pg_terminate_backend(<pid>);

-- 11) Мёртвые строки после ночи (если n_dead_tup у api_sync_state/api_cache в тысячах — повторить vacuum по одной команде):
select relname, n_live_tup, n_dead_tup, last_autovacuum from pg_stat_user_tables
where relname in ('api_lots','api_cache','api_sync_state');

-- 12) (23.09, вечер) Фильтры «статус продажи»: Timed и «без резерва» ищут по jsonb (payload->>'timed', payload->>'saleStatusKey') —
--     без индекса это полный проход по payload 600k лотов (точный счёт 4с+). Индексы по выражению делают их мгновенными.
--     Каждую команду — отдельным запросом в пустом редакторе (CONCURRENTLY не работает в транзакции). ~1–3 мин каждая.
create index concurrently if not exists idx_lots_timed_act
  on public.api_lots ((payload->>'timed')) where archived = false;
create index concurrently if not exists idx_lots_salekey_act
  on public.api_lots ((payload->>'saleStatusKey')) where archived = false;
