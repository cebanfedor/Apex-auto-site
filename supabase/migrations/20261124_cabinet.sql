-- Личный кабинет клиента (24.11.2026): избранное, заметки, «мои машины» (VIN), недавние просмотры.
-- Аккаунт = Telegram chat_id (привязка уже есть: alert_links.token → chat_id), паролей нет.
-- Выполнять в Supabase SQL Editor целиком одним запросом. Без таблицы кабинет работает на данных устройства (localStorage).

create table if not exists public.cab_items (
  chat_id    bigint not null,
  kind       text   not null check (kind in ('fav','note','car','view')),
  key        text   not null,                      -- fav/note/view: copart-123 / iaai-456; car: VIN
  data       jsonb  not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (chat_id, kind, key)
);
create index if not exists idx_cab_items_recent on public.cab_items (chat_id, kind, updated_at desc);

alter table public.cab_items enable row level security;   -- политик нет: доступ только сервисным ключом

notify pgrst, 'reload schema';
