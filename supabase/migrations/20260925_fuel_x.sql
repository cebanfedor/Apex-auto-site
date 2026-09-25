-- Реальный тип силовой установки по VIN (NHTSA vPIC), а не по фиду auctionsapi (у фида CX-90 Hybrid — «бензин», CX-90 PHEV — «гибрид»).
-- fuel_x: 1 дизель · 2 электро · 3 гибрид (HEV) · 4 бензин (в т.ч. mild-hybrid 48V) · 5 plug-in гибрид (PHEV); null — ещё не определён (тогда работает fuel_id фида).
-- fuel_src: 1 vPIC · 2 правила по названию/EPA · 4 vPIC: mild-hybrid. Колонки заполняет cron /api/cron/powertrain, синк их не трогает.
alter table public.api_lots add column if not exists fuel_x smallint;
alter table public.api_lots add column if not exists fuel_src smallint;
-- очередь на определение (ближайшие торги первыми) и быстрый поиск гибридов/plug-in
create index if not exists idx_lots_fuelx_todo on public.api_lots (sale_date) where fuel_x is null and archived = false;
create index if not exists idx_lots_fuelx_hy on public.api_lots (sale_date) where fuel_x in (3, 5) and archived = false;

-- Счётчики марок/моделей: топливо теперь coalesce(fuel_x, fuel_id)
create or replace function public._facet_ints(j jsonb)
returns text language sql immutable as $$
  select '{' || coalesce(string_agg((x)::int::text, ','), '') || '}' from jsonb_array_elements_text(coalesce(j, '[]'::jsonb)) x
$$;

create or replace function public.facet_counts(p jsonb)
returns table(mk int, md int, n bigint)
language plpgsql stable security definer set statement_timeout = '25s' as $$
declare
  w text[] := array['country is distinct from ''kr'''];
  tab text := coalesce(p->>'tab', 'all');
  sales text[] := '{}';
  s text;
  has_sale boolean := false;
  live text := '(sale_date >= now() or live_until >= now() or (live_until is null and sale_date >= now() - interval ''30 minutes''))';
begin
  if p->>'auction' in ('copart', 'iaai') then w := w || format('auction = %L', p->>'auction'); end if;

  if jsonb_array_length(coalesce(p->'vtype', '[]'::jsonb)) > 0 then
    w := w || format('vehicle_type_id = any(%L::int[])', public._facet_ints(p->'vtype'));
  else
    w := w || 'vehicle_type_id is distinct from 3'::text;
  end if;

  if jsonb_array_length(coalesce(p->'sale', '[]'::jsonb)) > 0 then
    for s in select jsonb_array_elements_text(p->'sale') loop
      if s = 'timed' then sales := sales || '(payload->>''timed'') = ''true'''::text;
      elsif s = 'no_reserve' then sales := sales || '(payload->>''saleStatusKey'') = ''no_reserve'''::text;
      elsif s = 'on_approval' then sales := sales || 'status_id = 4'::text;
      end if;
    end loop;
    if coalesce(array_length(sales, 1), 0) > 0 then
      w := w || ('(' || array_to_string(sales, ' or ') || ')');
      has_sale := true;
    end if;
  end if;

  if tab = 'archived' then
    w := w || 'archived = true and status_id = 6 and final_bid > 0 and sale_date <= now()'::text;
  elsif tab = 'buy_now' then
    w := w || 'archived = false and buy_now > 0 and status_id is distinct from 6 and (sale_date >= now() - interval ''24 hours'' or sale_date is null)'::text;
  elsif tab = 'soon' then
    w := w || ('archived = false and status_id is distinct from 6 and sale_date <= now() + interval ''48 hours'' and ' || live);
  else
    w := w || ('archived = false and status_id is distinct from 6 and (' || live || case when has_sale then '' else ' or sale_date is null' end || ')');
  end if;

  if jsonb_array_length(coalesce(p->'fuel', '[]'::jsonb)) > 0 then w := w || format('coalesce(fuel_x, fuel_id) = any(%L::int[])', public._facet_ints(p->'fuel')); end if;
  if jsonb_array_length(coalesce(p->'body', '[]'::jsonb)) > 0 then w := w || format('body_id = any(%L::int[])', public._facet_ints(p->'body')); end if;
  if jsonb_array_length(coalesce(p->'drive', '[]'::jsonb)) > 0 then w := w || format('drive_id = any(%L::int[])', public._facet_ints(p->'drive')); end if;
  if jsonb_array_length(coalesce(p->'trans', '[]'::jsonb)) > 0 then w := w || format('transmission_id = any(%L::int[])', public._facet_ints(p->'trans')); end if;
  if jsonb_array_length(coalesce(p->'cyl', '[]'::jsonb)) > 0 then w := w || format('cylinders = any(%L::int[])', public._facet_ints(p->'cyl')); end if;
  if jsonb_array_length(coalesce(p->'cond', '[]'::jsonb)) > 0 then w := w || format('condition_id = any(%L::int[])', public._facet_ints(p->'cond')); end if;
  if jsonb_array_length(coalesce(p->'country', '[]'::jsonb)) = 1 then w := w || format('country = %L', case when p->'country'->>0 = 'ca' then 'ca' else 'us' end); end if;
  if coalesce(p->>'state', '') <> '' then w := w || format('state_code = %L', lower(p->>'state')); end if;

  if p->>'year_from' is not null then w := w || format('year >= %s', (p->>'year_from')::int); end if;
  if p->>'year_to' is not null then w := w || format('year <= %s', (p->>'year_to')::int); end if;
  if p->>'bid_from' is not null then w := w || format('current_bid >= %s', (p->>'bid_from')::int); end if;
  if p->>'bid_to' is not null then w := w || format('current_bid <= %s', (p->>'bid_to')::int); end if;
  if p->>'buynow_from' is not null then w := w || format('buy_now >= %s', (p->>'buynow_from')::int); end if;
  if p->>'buynow_to' is not null then w := w || format('buy_now <= %s', (p->>'buynow_to')::int); end if;
  if p->>'odo_from' is not null then w := w || format('odometer_mi >= %s', (p->>'odo_from')::int); end if;
  if p->>'odo_to' is not null then w := w || format('odometer_mi <= %s', (p->>'odo_to')::int); end if;
  if p->>'eng_from' is not null or p->>'eng_to' is not null then
    w := w || 'engine_l > 0'::text;
    if p->>'eng_from' is not null then w := w || format('engine_l >= %s', (p->>'eng_from')::numeric); end if;
    if p->>'eng_to' is not null then w := w || format('engine_l <= %s', (p->>'eng_to')::numeric); end if;
  end if;
  if coalesce(p->>'smart', '') = '1' then w := w || '(resale is null or resale = 0)'::text; end if;

  return query execute 'select make_id, model_id, count(*)::bigint from public.api_lots where ' || array_to_string(w, ' and ') || ' group by 1, 2';
end $$;

revoke execute on function public.facet_counts(jsonb) from public, anon, authenticated;
revoke execute on function public._facet_ints(jsonb) from public, anon, authenticated;
