-- «До какого момента лот ещё в очереди онлайн-торгов»: sale_date + (позиция в линии + 15) минут. Пока NULL — работает окно «30 минут после старта».
alter table public.api_lots add column if not exists live_until timestamptz;
