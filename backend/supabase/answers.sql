
create table if not exists
    answers (
                id text not null primary key,
                index int, -- Order of the answer in the list
                contract_id text, -- Associated contract
                user_id text, -- Creator of the answer
                text text,
                created_time timestamptz default now(),
    -- Mechanism props
                pool_yes numeric, -- YES shares in the pool
                pool_no numeric, -- NO shares in the pool
                prob numeric, -- Probability of YES computed from pool_yes and pool_no
                total_liquidity numeric default 0, -- for historical reasons, this the total subsidy amount added in M
                subsidy_pool numeric default 0, -- current value of subsidy pool in M
                data jsonb not null,
                fs_updated_time timestamp not null,
                text_fts tsvector generated always as (to_tsvector('english', text)) stored,
                prob_change_day numeric default 0, -- change in prob in the last 24h
                prob_change_week numeric default 0, -- change in prob in the last week
                prob_change_month numeric default 0 -- change in prob in the last month
);

create index if not exists answer_text_fts on answers using gin (text_fts);
create index if not exists answer_contract_id on answers (contract_id);

alter table answers enable row level security;

drop policy if exists "public read" on answers;

create policy "public read" on answers for
    select
    using (true);

create
    or replace function answers_populate_cols () returns trigger language plpgsql as $$
begin
    if new.data is not null then
        new.index := ((new.data) ->> 'index')::int;
        new.contract_id := (new.data) ->> 'contractId';
        new.user_id := (new.data) ->> 'userId';
        new.text := ((new.data) ->> 'text')::text;
        new.created_time :=
                case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;

        new.pool_yes := ((new.data) ->> 'poolYes')::numeric;
        new.pool_no := ((new.data) ->> 'poolNo')::numeric;
        new.prob := ((new.data) ->> 'prob')::numeric;
        new.total_liquidity := ((new.data) ->> 'totalLiquidity')::numeric;
        new.subsidy_pool := ((new.data) ->> 'subsidyPool')::numeric;
        new.prob_change_day := ((new.data) -> 'probChanges'->>'day')::numeric;
        new.prob_change_week := ((new.data) -> 'probChanges'->>'week')::numeric;
        new.prob_change_month := ((new.data) -> 'probChanges'->>'month')::numeric;
    end if;
    return new;
end
$$;

create trigger answers_populate before insert
    or
    update on answers for each row
execute function answers_populate_cols ();
