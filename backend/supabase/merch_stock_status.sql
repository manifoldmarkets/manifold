create table if not exists
  merch_stock_status (
    item_id text primary key not null,
    out_of_stock boolean default false not null
  );

-- Pre-seed all merch items as out of stock (flip to in-stock via admin toggle when ready)
insert into merch_stock_status (item_id, out_of_stock) values
  ('merch-aggc-tshirt', true),
  ('merch-cap-white-logo', true),
  ('merch-cap-purple-logo', true)
on conflict (item_id) do nothing;

-- RLS: public read, no client-side writes (all mutations go through service role)
alter table merch_stock_status enable row level security;
create policy "public read" on merch_stock_status for select using (true);
