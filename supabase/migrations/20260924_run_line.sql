-- Очередь онлайн-торгов Copart: линия (A/B/…) и номер лота в зале (поле фида lots[0].line = "B/2113").
alter table public.api_lots add column if not exists lane text;
alter table public.api_lots add column if not exists run_no int;
create index if not exists idx_lots_lane_run on public.api_lots (sale_date, lane, run_no) where run_no is not null;
