-- Personalized mana sale offers granted to users after merch purchases ship.
-- Each merch order grants one offer (uniqueness enforced by index on shop_order_id).
-- Offers are 'pending' until the user first views /checkout, at which point all
-- of that user's pending offers flip to 'active' with a shared 24h expiry.

create table if not exists
  personalized_mana_offers (
    id text primary key default random_alphanumeric (12) not null,
    user_id text not null references users (id),
    shop_order_id uuid not null references shop_orders (id),
    source text not null default 'merch_shipped',
    status text not null default 'pending',
    mana_amount integer not null default 5000,
    price_usd_stripe integer not null default 40,
    price_usd_crypto integer not null default 35,
    created_at timestamp with time zone not null default now(),
    activated_at timestamp with time zone,
    expires_at timestamp with time zone,
    redeemed_at timestamp with time zone,
    redemption_method text,
    redemption_session_id text,
    voided_reason text,
    constraint personalized_mana_offers_status_check
      check (status in ('pending', 'active', 'redeemed', 'expired', 'voided')),
    constraint personalized_mana_offers_redemption_method_check
      check (redemption_method is null or redemption_method in ('stripe', 'crypto'))
  );

create unique index if not exists personalized_mana_offers_shop_order_id_key
  on personalized_mana_offers (shop_order_id);

create index if not exists personalized_mana_offers_user_status_idx
  on personalized_mana_offers (user_id, status);

create index if not exists personalized_mana_offers_active_expires_idx
  on personalized_mana_offers (expires_at)
  where status = 'active';

alter table personalized_mana_offers enable row level security;

-- Link redeemed crypto payments back to the offer they consumed (so the webhook
-- can attribute the discounted rate and bookkeeping is preserved).
alter table crypto_payment_intents
add column if not exists offer_id text references personalized_mana_offers (id);
