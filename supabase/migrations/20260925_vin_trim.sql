-- Комплектация из VIN (NHTSA vPIC) для полного названия лота: «Toyota Rav4 Hybrid XSE», «Tesla Model Y Long Range Dual Motor».
-- vin_trim: '' — VIN разобран, комплектации нет; null — ещё не разобран (очередь крона /api/cron/powertrain).
alter table public.api_lots add column if not exists vin_trim text;
create index if not exists idx_lots_trim_todo on public.api_lots (sale_date) where vin_trim is null and archived = false;

-- Пакетная запись результата разбора VIN (одним запросом вместо десятков): p = {"<id>": {"x": fuel_x, "s": fuel_src, "t": trim}, …}
create or replace function public.set_pt(p jsonb)
returns int language plpgsql security definer set statement_timeout = '30s' as $$
declare n int;
begin
  update public.api_lots a
     set fuel_x = (e.value->>'x')::smallint, fuel_src = (e.value->>'s')::smallint, vin_trim = coalesce(e.value->>'t', '')
    from jsonb_each(p) e
   where a.id = e.key;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_pt(jsonb) from public, anon, authenticated;
