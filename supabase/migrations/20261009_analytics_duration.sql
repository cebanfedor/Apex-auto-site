-- Среднее время на сайте + отказы (Федор 09.10.2026: «сколько времени провели», «что людям интересно»).
-- Хартбиты (analytics.js шлёт каждые 45с, пока вкладка открыта и видима) раньше писались ТОЛЬКО
-- в site_online (чтобы знать «кто сейчас на сайте») — сама длительность визита нигде не считалась.
-- Теперь api/track.js пишет хартбиты и в site_hits тоже, с меткой ev='_hb' (служебная, не из
-- публичного списка EVENTS в api/track.js — её нельзя подделать с клиента как обычное событие).
-- Длительность сессии = max(ts)-min(ts) по всем строкам (просмотры + '_hb') одного посетителя (vh) за день;
-- просмотры/посетителей эти строки не искажают — и там, и там фильтр "ev is null" как был.

create or replace function public.site_stats(days int default 7)
returns jsonb
language plpgsql
stable
as $fn$
declare
  d int := greatest(1, least(coalesce(days, 7), 90));
  today0 timestamptz := date_trunc('day', now() at time zone 'Europe/Chisinau') at time zone 'Europe/Chisinau';
  since timestamptz := (date_trunc('day', now() at time zone 'Europe/Chisinau') - make_interval(days => d - 1)) at time zone 'Europe/Chisinau';
begin
  return jsonb_build_object(
    'online', (select count(*) from public.site_online where ts > now() - interval '5 minutes'),
    'online_pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc)
      from (select path, count(*) n from public.site_online where ts > now() - interval '5 minutes' group by path order by n desc limit 8) t), '[]'::jsonb),
    'today', (select jsonb_build_object('visitors', count(distinct vh), 'views', count(*)) from public.site_hits where ts >= today0 and ev is null),
    'period', (select jsonb_build_object('visitors', coalesce(sum(v), 0), 'views', coalesce(sum(w), 0))
      from (select count(distinct vh) v, count(*) w from public.site_hits where ts >= since and ev is null group by (ts at time zone 'Europe/Chisinau')::date) x),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', dt, 'visitors', v, 'views', w) order by dt)
      from (select (ts at time zone 'Europe/Chisinau')::date as dt, count(distinct vh) v, count(*) w from public.site_hits where ts >= since and ev is null group by 1) x), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('page', pg, 'views', w, 'visitors', v) order by w desc)
      from (select case when path like '/auctions/%' then '/auctions/… (страницы лотов)' when path like '/in-transit/%' then '/in-transit/… (объявления)' else path end pg,
                   count(*) w, count(distinct vh) v
            from public.site_hits where ts >= since and ev is null group by 1 order by w desc limit 15) x), '[]'::jsonb),
    'top_lots', coalesce((select jsonb_agg(jsonb_build_object('page', path, 'views', w, 'visitors', v) order by w desc)
      from (select path, count(*) w, count(distinct vh) v from public.site_hits where ts >= since and ev is null and path like '/auctions/%' group by path order by w desc limit 15) x), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(jsonb_build_object('ref', r, 'visitors', v) order by v desc)
      from (select coalesce(nullif(ref, ''), 'Прямой заход') r, count(distinct vh) v from public.site_hits where ts >= since and ev is null group by 1 order by v desc limit 10) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('c', c, 'visitors', v) order by v desc)
      from (select coalesce(nullif(ctry, ''), '—') c, count(distinct vh) v from public.site_hits where ts >= since and ev is null group by 1 order by v desc limit 8) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('d', dv, 'visitors', v) order by v desc)
      from (select coalesce(dev, '?') dv, count(distinct vh) v from public.site_hits where ts >= since and ev is null group by 1) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('ev', ev, 'n', n, 'visitors', v) order by n desc)
      from (select ev, count(*) n, count(distinct vh) v from public.site_hits where ts >= since and ev is not null and ev <> '_hb' group by ev) x), '[]'::jsonb),
    'engagement', (select jsonb_build_object(
        'avg_duration_sec', coalesce(round(avg(extract(epoch from dur)))::int, 0),
        'bounce_rate', coalesce(round(100.0 * count(*) filter (where views = 1) / nullif(count(*), 0))::int, 0),
        'sessions', count(*)
      )
      from (
        select vh, count(*) filter (where ev is null) as views, max(ts) - min(ts) as dur
        from public.site_hits
        where ts >= since and (ev is null or ev = '_hb')
        group by vh, (ts at time zone 'Europe/Chisinau')::date
        having count(*) filter (where ev is null) >= 1
      ) sess
    ),
    'alerts', jsonb_build_object(
      'links', (select count(*) from public.alert_links),
      'bound', (select count(*) from public.alert_links where chat_id is not null),
      'links_period', (select count(*) from public.alert_links where created_at >= since),
      'bound_period', (select count(*) from public.alert_links where bound_at >= since),
      'search_subs', (select count(*) from public.alert_subs where active and kind = 'search'),
      'lot_subs', (select count(*) from public.alert_subs where active and kind = 'lot'),
      'watched', coalesce((select jsonb_agg(jsonb_build_object('lot', t, 'n', n) order by n desc)
        from (select coalesce(lot_title, lot_id) t, count(*) n from public.alert_subs where kind = 'lot' and created_at >= since group by 1 order by n desc limit 10) x), '[]'::jsonb),
      'series', coalesce((select jsonb_agg(jsonb_build_object('day', dt, 'links', l, 'bound', b) order by dt)
        from (select (created_at at time zone 'Europe/Chisinau')::date as dt, count(*) l, count(*) filter (where chat_id is not null) b
              from public.alert_links where created_at >= since group by 1) x), '[]'::jsonb)
    )
  );
end;
$fn$;

revoke execute on function public.site_stats(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
