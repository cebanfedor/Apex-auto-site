-- Ручная коррекция финальной цены конкретного лота (Федор 09.10.2026).
-- Наш фид (auctionsapi.com) иногда не содержит правильную финалку вообще (ни в одном раунде VIN-истории) —
-- это пробел источника, не баг вычисления (см. CLAUDE.md «Финал проданного Timed»). Когда у Федора есть
-- подтверждённая реальная цена из другого источника (DreamBid и т.п.), он добавляет строку сюда.
create table if not exists public.lot_price_override (
  lot_id     text primary key,   -- формат "iaai-44985240" / "copart-61420506"
  final_bid  numeric not null,
  reason     text,
  created_at timestamptz not null default now()
);
alter table public.lot_price_override enable row level security;
notify pgrst, 'reload schema';

-- Tesla Model Y IAAI 44985240 (VIN 7SAYGDEE0RA302056): наш фид отдаёт $14,400 (это реальный раунд "sold"
-- из их данных, не наша ошибка расчёта), DreamBid — $14,700, Федор подтверждает их цифру.
insert into public.lot_price_override (lot_id, final_bid, reason) values
  ('iaai-44985240', 14700, 'Tesla Model Y VIN 7SAYGDEE0RA302056 — Федор подтвердил $14,700 по DreamBid, наш фид даёт устаревшие/заниженные $14,400')
on conflict (lot_id) do update set final_bid = excluded.final_bid, reason = excluded.reason;
