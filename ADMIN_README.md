# APEX AUTO CRM Admin

Админка доступна только по прямому адресу:

```txt
https://apexauto.md/admin
```

Публичную кнопку входа на сайт добавлять не нужно.

## Что есть в админке

- Защищенный вход по `ADMIN_PASSWORD`.
- Серверная `HttpOnly` cookie-сессия на 12 часов.
- Dashboard: количество клиентов, заявок, автомобилей и последние заявки.
- CRUD для автомобилей, клиентов и заявок.
- Привязка заявки к клиенту и автомобилю.
- Статусы заявок: `Новый`, `Перезвонить`, `В работе`, `Купил`, `Закрыт`.
- Редактирование логотипа, телефона, Telegram, WhatsApp, главных текстов и преимуществ.
- Загрузка логотипа и фото автомобилей через Vercel Blob.

## Environment Variables в Vercel

Обязательные:

```txt
ADMIN_PASSWORD=your-strong-password
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BLOB_READ_WRITE_TOKEN=vercel-blob-read-write-token
```

Уже используемые в проекте:

```txt
SUPABASE_ANON_KEY=your-anon-key
AUCTIONS_API_KEY=your-auctions-api-key
BLOB_STORE_ID=your-blob-store-id
BLOB_WEBHOOK_PUBLIC_KEY=your-blob-webhook-public-key
```

Опциональные (для Telegram-уведомлений о новых лидах):

```txt
TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789
```

> Как получить: создай бота через @BotFather → скопируй токен. Chat ID — запусти бота,
> открой `https://api.telegram.org/bot<TOKEN>/getUpdates`, найди `"chat":{"id":...}`.
> Без этих переменных лиды сохраняются в Supabase, но push-уведомлений не будет.

Рекомендуемые:

```txt
ADMIN_SESSION_SECRET=long-random-string
OPENAI_API_KEY=your-openai-key
```

`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` и `BLOB_READ_WRITE_TOKEN` используются только в serverless API routes. Не добавляй эти значения в frontend JS.

## Supabase

В проекте ожидаются таблицы:

```txt
customers
vehicles
leads
site_content
```

Важно: текущая схема проекта использует `bigint` для `id`:

```txt
customers.id bigint
vehicles.id bigint
leads.id bigint
site_content.id bigint
```

Миграция находится здесь:

```txt
supabase/migrations/20260614_admin_crm.sql
```

Она не удаляет существующие таблицы, не переводит их на `uuid` и добавляет только недостающие поля, индексы и `updated_at` triggers.

## Vercel Blob

Для загрузки файлов через `@vercel/blob` серверному API нужен `BLOB_READ_WRITE_TOKEN`.

`BLOB_STORE_ID` и `BLOB_WEBHOOK_PUBLIC_KEY` сами по себе не являются токеном для записи файлов. Если загрузка логотипа или фото возвращает ошибку `Missing BLOB_READ_WRITE_TOKEN`, подключи Blob Store к Vercel-проекту и добавь read-write token в Environment Variables.

Загрузка идет через:

```txt
POST /api/uploads
```

Frontend не получает Blob token.

## API routes

Auth:

```txt
POST /api/admin?action=login
POST /api/admin?action=logout
GET  /api/admin?action=me
GET  /api/admin?action=dashboard
```

Vehicles:

```txt
GET    /api/vehicles
POST   /api/vehicles
PATCH  /api/vehicles?id=...
DELETE /api/vehicles?id=...
```

Customers:

```txt
GET    /api/customers
POST   /api/customers
PATCH  /api/customers?id=...
DELETE /api/customers?id=...
```

Leads:

```txt
GET    /api/leads
POST   /api/leads
PATCH  /api/leads?id=...
DELETE /api/leads?id=...
```

Content:

```txt
GET /api/content
PUT /api/content
```

## Проверка деплоя

1. Открой `https://apexauto.md/admin`.
2. Войди паролем из `ADMIN_PASSWORD`.
3. Проверь Dashboard.
4. Создай тестового клиента, автомобиль и заявку.
5. Проверь загрузку фото автомобиля и логотипа.
6. Открой публичный сайт и убедись, что он загружается без кнопки админки.

## Локальная проверка

Для локального запуска нужен Node.js:

```txt
PORT=8086 ADMIN_PASSWORD=test SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BLOB_READ_WRITE_TOKEN=... node local-server.js
```

Затем открыть:

```txt
http://127.0.0.1:8086/admin/
```

Без Supabase env вход откроется, но dashboard и таблицы не загрузятся.
