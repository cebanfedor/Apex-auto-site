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
