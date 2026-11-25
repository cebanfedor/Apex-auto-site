-- Сделка привязывается к клиенту из Telegram напрямую (26.11.2026): менеджер выбирает клиента из списка
-- «Клиенты сайта» — сообщения об этапах идут в его чат, подтверждать номер телефона в боте не нужно.
-- Выполнять в Supabase SQL Editor целиком одним запросом.

alter table public.cab_deals add column if not exists chat_id text;
create index if not exists idx_cab_deals_chat on public.cab_deals (chat_id, active, updated_at desc);

notify pgrst, 'reload schema';
