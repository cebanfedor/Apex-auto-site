-- Фильтр «Объём двигателя»: отдельная колонка в литрах (0 = не бензин/дизель или объём неизвестен).
alter table public.api_lots add column if not exists engine_l numeric(3,1);

-- Очередь заливки: строки без значения. Заливает cron (/api/cron/engine), можно и руками.
create index if not exists idx_lots_engine_todo on public.api_lots (id) where engine_l is null;

create or replace function public.fill_engine_l(n int default 2000)
returns int language plpgsql security definer set statement_timeout = '50s' as $$
declare c int;
begin
  with t as (
    select id from public.api_lots where engine_l is null limit n for update skip locked
  )
  update public.api_lots a
     set engine_l = coalesce((substring(a.payload->>'engine' from '(?i)^([0-9]{1,2}\.[0-9])\s*l'))::numeric, 0)
    from t where a.id = t.id;
  get diagnostics c = row_count;
  return c;
end $$;
revoke execute on function public.fill_engine_l(int) from public, anon, authenticated;
