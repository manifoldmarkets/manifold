create table if not exists
    contract_bets (
                      contract_id text not null,
                      bet_id text not null,
                      user_id text not null,
                      answer_id text,
                      created_time timestamptz not null,
                      amount numeric,
                      shares numeric,
                      outcome text,
                      prob_before numeric,
                      prob_after numeric,
                      is_ante boolean,
                      is_api boolean,
                      is_redemption boolean,
                      is_challenge boolean,
                      visibility text,
                      data jsonb not null,
                      fs_updated_time timestamp not null,
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
    if new.data is not null then
        new.user_id := (new.data) ->> 'userId';
        new.created_time :=
                case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
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
    end if;
    return new;
end
$$;

create trigger contract_bet_populate before insert
    or
    update on contract_bets for each row
execute function contract_bet_populate_cols ();

/* serves bets API pagination */
create index if not exists contract_bets_bet_id on contract_bets (bet_id);

/* serving activity feed bets list */
create index if not exists contract_bets_activity_feed on contract_bets (is_ante, is_redemption, created_time desc);

/* serving update contract metrics */
create index if not exists contract_bets_historical_probs on contract_bets (created_time) include (contract_id, prob_before, prob_after);

/* serving e.g. the contract page recent bets and the "bets by contract" API */
create index if not exists contract_bets_created_time on contract_bets (contract_id, created_time desc);

/* serving "my trades on a contract" kind of queries */
create index if not exists contract_bets_contract_user_id on contract_bets (contract_id, user_id, created_time desc);

/* serving the user bets API */
create index if not exists contract_bets_user_id on contract_bets (user_id, created_time desc);

create index if not exists contract_bets_answer_id_created_time
    on contract_bets (answer_id, created_time desc);

create index if not exists contract_bets_user_outstanding_limit_orders on contract_bets (
                                                                                         user_id,
                                                                                         ((data -> 'isFilled')::boolean),
                                                                                         ((data -> 'isCancelled')::boolean)
    );

create index if not exists contract_bets_unexpired_limit_orders on contract_bets (
                                                                                  (data ->> 'expiresAt' is not null),
                                                                                  ((data ->> 'isFilled')),
                                                                                  ((data ->> 'isCancelled')),
                                                                                  is_ante,
                                                                                  is_redemption,
                                                                                  ((data ->> 'expiresAt'))
    );

create index contract_bets_contract_id_user_id on contract_bets(contract_id, user_id);

create index contract_bets_comment_reply_id on contract_bets((data ->> 'replyToCommentId'));

alter table contract_bets
    cluster on contract_bets_created_time;




drop policy if exists "Enable read access for non private bets" on public.contract_bets;

create policy "Enable read access for non private bets" on public.contract_bets for
    select
    using ((visibility <> 'private'::text));

create or replace view
    public.contract_bets_rbac as
select
    *
from
    contract_bets
where
    (visibility <> 'private')
   or (
    can_access_private_contract (contract_id, firebase_uid ())
    )
