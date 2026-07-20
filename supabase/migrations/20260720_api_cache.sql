-- Persistent cache for auctionsapi.com responses.
-- Shared across all Vercel function instances (unlike in-memory Map).
-- TTLs: search=6h, detail=24h, vin=7d.
create table if not exists public.api_cache (
  cache_key   text        primary key,
  data        jsonb       not null,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

create index if not exists idx_api_cache_expires
  on public.api_cache (expires_at);

-- RLS: only service_role key can read/write (never exposed to browser).
alter table public.api_cache enable row level security;
