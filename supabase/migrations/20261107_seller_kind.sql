-- Фильтр «Тип продавца» в каталоге: 1 страховая · 2 не страховая (дилер/частный) · 3 прокат · 0 не определён.
-- Колонку заливает cron /api/cron/engine (функция fill_seller_kind, по 2500 строк за порцию) — синк её не трогает.
alter table public.api_lots add column if not exists seller_kind smallint;

-- Очередь заливки: строки без значения (0 = «определили, но тип неизвестен», в очереди не остаётся).
create index if not exists idx_lots_seller_kind_todo on public.api_lots (id) where seller_kind is null;
-- Сам фильтр: активные лоты по типу продавца и дате (как остальные индексы под вкладки).
create index if not exists idx_lots_seller_kind on public.api_lots (seller_kind, sale_date) where archived = false and seller_kind > 0;

create or replace function public.fill_seller_kind(n int default 2000)
returns int language plpgsql security definer set statement_timeout = '50s' as $$
declare c int;
begin
  with t as (
    select id from public.api_lots where seller_kind is null limit n for update skip locked
  )
  update public.api_lots a
     set seller_kind = case
       when coalesce(a.payload->>'seller','') ilike '%· Прокат%' then 3
       when coalesce(a.payload->>'sellerType','') ~* 'non[ _-]?insurance' then 2
       when coalesce(a.payload->>'sellerType','') ~* 'insurance' then 1
       when coalesce(a.payload->>'seller','') ilike '%· Страховая%' then 1
       when coalesce(a.payload->>'seller','') ilike '%· Дилер%' then 2
       else 0 end
    from t where a.id = t.id;
  get diagnostics c = row_count;
  return c;
end $$;
revoke execute on function public.fill_seller_kind(int) from public, anon, authenticated;

analyze public.api_lots;
