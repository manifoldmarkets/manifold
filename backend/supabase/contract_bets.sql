create table if not exists
  contract_bets (
    contract_id text not null,
    bet_id text not null default random_alphanumeric (12),
    user_id text not null,
    answer_id text,
    created_time timestamptz not null default now(),
    amount numeric,
    shares numeric,
    outcome text,
    prob_before numeric,
    prob_after numeric,
    is_ante boolean,
    is_api boolean,
    is_redemption boolean,
    is_challenge boolean,
    loan_amount numeric,
    visibility text,
    data jsonb not null,
    updated_time timestamptz not null default now(),
    primary key (contract_id, bet_id)
  );

alter table contract_bets enable row level security;

drop policy if exists "public read" on contract_bets;

create policy "public read" on contract_bets for
select
  using (true);

create
or replace function contract_bet_populate_cols () returns trigger language plpgsql as $$
begin
    if new.bet_id is not null then
        new.data := new.data || jsonb_build_object('id', new.bet_id);
    end if;
    if new.updated_time is null and new.created_time is not null then
        new.updated_time := new.created_time;
    end if;
    if new.data is not null then
        new.user_id := (new.data) ->> 'userId';
        new.amount := ((new.data) ->> 'amount')::numeric;
        new.shares := ((new.data) ->> 'shares')::numeric;
        new.outcome := ((new.data) ->> 'outcome');
        new.prob_before := ((new.data) ->> 'probBefore')::numeric;
        new.prob_after := ((new.data) ->> 'probAfter')::numeric;
        new.is_ante := ((new.data) -> 'isAnte')::boolean;
        new.is_redemption := ((new.data) -> 'isRedemption')::boolean;
        new.is_challenge := ((new.data) -> 'isChallenge')::boolean;
        new.visibility := ((new.data) ->> 'visibility')::text;
        new.answer_id := ((new.data) ->> 'answerId')::text;
        new.is_api := ((new.data) ->> 'isApi')::boolean;
        new.loan_amount := ((new.data) ->> 'loanAmount')::numeric;
    end if;
    return new;
end
$$;

create
or replace trigger contract_bet_populate before insert
or
update on contract_bets for each row
execute function contract_bet_populate_cols ();

create
or replace function contract_bet_set_updated_time () returns trigger language plpgsql as $$
begin
    new.updated_time = now();
    return new;
end;
$$;

create
or replace trigger contract_bet_update
after
update on contract_bets for each row
execute function contract_bet_set_updated_time ();

/* serves bets API pagination */
create index if not exists contract_bets_bet_id on contract_bets (bet_id);

/* serving update contract metrics */
create index contract_bets_historical_probs on contract_bets (contract_id, answer_id, created_time desc)
    include (prob_before, prob_after);

/* serving e.g. the contract page recent bets and the "bets by contract" API */
create index if not exists contract_bets_created_time on contract_bets (contract_id, created_time desc);

/* serving "my trades on a contract" kind of queries */
create index if not exists contract_bets_contract_user_id on contract_bets (contract_id, user_id, created_time desc);

/* serving the user bets API */
create index if not exists contract_bets_user_id on contract_bets (user_id, created_time desc);

create index if not exists contract_bets_answer_id_created_time on contract_bets (answer_id, created_time desc);

create index if not exists contract_bets_user_outstanding_limit_orders on contract_bets (
  user_id,
  ((data -> 'isFilled')::boolean),
  ((data -> 'isCancelled')::boolean)
);

create index concurrently if not exists contract_bets_user_updated_time on contract_bets (user_id, updated_time desc);

create index if not exists contract_bets_created_time_only on contract_bets (created_time desc);

alter table contract_bets
cluster on contract_bets_created_time;
