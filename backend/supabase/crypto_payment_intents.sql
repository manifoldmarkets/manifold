-- Table for tracking processed Daimo Pay crypto payments
-- Used for idempotency to prevent double-crediting mana
create table if not exists
  crypto_payment_intents (
    id bigint primary key generated always as identity not null,
    intent_id text not null,
    user_id text not null,
    created_time timestamp with time zone default now() not null,
    usdc_amount numeric(20, 6),
    mana_amount integer
  );

-- Foreign Keys
alter table crypto_payment_intents
add constraint crypto_payment_intents_user_id_fkey foreign key (user_id) references users (id);

-- Row Level Security
alter table crypto_payment_intents enable row level security;

-- Indexes
drop index if exists crypto_payment_intents_pkey;

create unique index crypto_payment_intents_pkey on public.crypto_payment_intents using btree (id);

drop index if exists crypto_payment_intents_intent_id_idx;

create unique index crypto_payment_intents_intent_id_idx on public.crypto_payment_intents using btree (intent_id);

drop index if exists crypto_payment_intents_user_id_idx;

create index crypto_payment_intents_user_id_idx on public.crypto_payment_intents using btree (user_id);
