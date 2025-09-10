-- Create shop_orders table (empty initial deployment)
create table if not exists
  public.shop_orders (
    id uuid primary key default gen_random_uuid (),
    user_id text not null,
    item_id text not null,
    item_type text not null check (item_type in ('digital', 'printful', 'other')),
    price_mana bigint not null,
    quantity int not null default 1,
    txn_id text null,
    printful_order_id text null,
    printful_status text null,
    status text not null default 'CREATED',
    status_synced_time timestamptz null,
    metadata jsonb null,
    created_time timestamptz not null default now(),
    delivered_time timestamptz null
  );

create index if not exists shop_orders_user_created_idx on public.shop_orders (user_id, created_time desc);

create index if not exists shop_orders_printful_id_idx on public.shop_orders (printful_order_id);

create index if not exists shop_orders_status_idx on public.shop_orders (status);
