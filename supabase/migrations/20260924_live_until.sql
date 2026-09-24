-- «До какого момента лот ещё в очереди онлайн-торгов»: sale_date + (позиция в линии + 15) минут. Пока NULL — работает окно «30 минут после старта».
alter table public.api_lots add column if not exists live_until timestamptz;

-- Пересчёт (cron /api/cron/engine, каждые 3 мин): live_until = старт + (порядковый номер лота в линии + 15) минут, для аукционов, начавшихся за последние 10 часов.
create or replace function public.refresh_live_until()
returns int language plpgsql security definer set statement_timeout = '30s' as $$
declare c int;
begin
  with r as (
    select id, sale_date, row_number() over (partition by sale_date, lane order by run_no) rk
    from public.api_lots
    where run_no is not null and id not like '%-s2%'
      and sale_date between now() - interval '10 hours' and now()
  )
  update public.api_lots a
     set live_until = r.sale_date + (r.rk * 1.5 + 15) * interval '1 minute'
    from r
   where a.id = r.id and a.archived = false
     and a.live_until is distinct from r.sale_date + (r.rk * 1.5 + 15) * interval '1 minute';
  get diagnostics c = row_count;
  return c;
end $$;
revoke execute on function public.refresh_live_until() from public, anon, authenticated;
