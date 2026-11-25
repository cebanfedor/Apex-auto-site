-- Расчёт доставки и таможни в «Мои сделки»: доставка по США/море ($), таможня и брокер (лей), скидка, курс.
alter table public.cab_deals add column if not exists calc jsonb;
