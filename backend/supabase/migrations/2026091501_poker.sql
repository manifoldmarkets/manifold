-- Deploy before enabling the poker API/scheduler. No client role can read these
-- tables: private links, hole cards and locked moves require the authorized API.
create table
  public.poker_settings (
    id boolean primary key default true check (id),
    new_hands_enabled boolean not null default true
  );

insert into
  public.poker_settings (id)
values
  (true);

create table
  public.poker_tables (
    id uuid primary key,
    creator_id text not null references public.users (id),
    name text not null,
    visibility text not null check (visibility in ('public', 'private')),
    ante bigint not null check (
      ante > 0
      and ante <= 90071992547409
    ),
    access_hash text,
    started boolean not null default false,
    closing boolean not null default false,
    closed boolean not null default false,
    paused boolean not null default false,
    version bigint not null default 0,
    hand_number integer not null default 0,
    dealer integer not null default 8 check (dealer between 0 and 8),
    next_tick bigint,
    created_time timestamptz not null default now(),
    check (
      (visibility = 'private') = (access_hash is not null)
    )
  );

create index poker_tables_due on public.poker_tables (next_tick)
where
  not closed
  and not paused;

create table
  public.poker_seats (
    table_id uuid not null references public.poker_tables (id),
    user_id text primary key references public.users (id),
    seat integer not null check (seat between 0 and 8),
    session_id uuid not null unique,
    ready boolean not null default false,
    needs_minimum boolean not null default true,
    leaving boolean not null default false,
    auto_paper boolean not null default false,
    session_profit bigint not null default 0,
    unique (table_id, seat)
  );

create table
  public.poker_hands (
    id uuid primary key,
    table_id uuid not null references public.poker_tables (id),
    number integer not null,
    state jsonb not null,
    escrow bigint not null default 0 check (escrow >= 0),
    settled boolean not null default false,
    created_time timestamptz not null default now(),
    unique (table_id, number)
  );

create index poker_held_escrow on public.poker_hands (escrow)
where
  escrow > 0;

create unique index poker_one_active_hand on public.poker_hands (table_id)
where
  not settled;

create table
  public.poker_moves (
    hand_id uuid not null references public.poker_hands (id),
    street integer not null check (street between 0 and 3),
    user_id text not null references public.users (id),
    move text not null check (
      move in ('rock', 'paper', 'scissors')
    ),
    primary key (hand_id, street, user_id)
  );

create table
  public.poker_ledger (
    hand_id uuid not null references public.poker_hands (id),
    operation text not null,
    user_id text not null references public.users (id),
    amount bigint not null check (amount > 0),
    kind text not null check (kind in ('contribution', 'refund', 'payout')),
    txn_id text not null unique references public.txns (id),
    primary key (hand_id, operation)
  );

create table
  public.poker_requests (
    user_id text not null references public.users (id),
    request_id uuid not null,
    table_id uuid not null references public.poker_tables (id),
    fingerprint text not null,
    created_time timestamptz not null default now(),
    primary key (user_id, request_id)
  );

create table
  public.poker_moderation (
    table_id uuid not null references public.poker_tables (id),
    user_id text not null references public.users (id),
    muted boolean not null default false,
    banned boolean not null default false,
    primary key (table_id, user_id)
  );

create table
  public.poker_messages (
    id bigint generated always as identity primary key,
    table_id uuid not null references public.poker_tables (id),
    user_id text not null references public.users (id),
    text text not null check (length(text) between 1 and 2000),
    created_time timestamptz not null default now()
  );

create index poker_messages_table on public.poker_messages (table_id, id desc);

-- RLS is also enabled on the singleton switch and request/ledger tables.
do $$ declare t text; begin
  foreach t in array array['poker_settings','poker_tables','poker_seats','poker_hands',
    'poker_moves','poker_ledger','poker_requests','poker_moderation','poker_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
