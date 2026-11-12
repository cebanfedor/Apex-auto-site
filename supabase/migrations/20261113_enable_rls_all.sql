-- Аудит 13.11.2026: включаем Row Level Security на ВСЕХ таблицах схемы public.
-- Весь код сайта ходит в базу только с сервисным ключом (service_role обходит RLS), anon-ключ нигде не используется
-- (проверено grep по репозиторию). Таблицы без RLS (customers, leads, vehicles, guide_miss, …) при утечке/использовании
-- публичного anon-ключа читались бы напрямую через REST API Supabase.
-- Безопасно перезапускать. Выполнять в SQL Editor целиком одним запросом.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'RLS enabled on %', r.relname;
  end loop;
end $$;
-- Проверка: должно вернуть 0 строк
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
