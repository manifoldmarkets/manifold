begin;

create table
  public.perp_orders (
    id text primary key,
    contract_id text not null references contracts (id),
    user_id text not null references users (id),
    idempotency_key text not null,
    fingerprint text not null,
    request jsonb not null,
    is_api boolean not null,
    expected_opened_time bigint,
    reserved_mana numeric not null check (reserved_mana >= 0),
    created_time timestamptz not null default clock_timestamp(),
    expires_time timestamptz not null,
    status text not null default 'pending' check (
      status in ('pending', 'filled', 'rejected', 'expired')
    ),
    result jsonb,
    error text,
    execution_point jsonb,
    completed_time timestamptz,
    participation_applied_at timestamptz,
    unique (user_id, contract_id, idempotency_key)
  );

create unique index perp_orders_one_pending on public.perp_orders (contract_id, user_id)
where
  status = 'pending';

create index perp_orders_pending on public.perp_orders (contract_id, created_time, id)
where
  status = 'pending';

create index perp_orders_owner on public.perp_orders (user_id, contract_id, created_time desc);

create index perp_orders_participation on public.perp_orders (completed_time, id)
where
  status = 'filled'
  and participation_applied_at is null;

alter table public.perp_orders enable row level security;

-- Pending instructions are private. Only authenticated backend handlers read them.
revoke all on public.perp_orders
from
  anon,
  authenticated;

comment on table public.perp_orders is 'Non-cancellable next-price market instructions. Reserved mana is held in BANK:PERP_ORDER_ESCROW, never in trading pools.';

commit;
