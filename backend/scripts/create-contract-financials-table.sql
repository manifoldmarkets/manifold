create table
  contract_financials (
    id serial primary key,
    contract_id text not null references contracts (id),
    token text default 'MANA' not null,
    mechanism text not null,
    outcome_type text not null,
    data jsonb not null
  );

-- add replication trigger from contracts to contract_financials
create
or replace function contract_financials_replication_trigger_function () returns trigger language plpgsql as $function$
declare
--pick relevant information out of new.data
    relevant_data jsonb := (
        select
            jsonb_object_agg(key, value) as data
        from
            jsonb_each(new.data)
        where
            key in (
                -- cpmm
                'pool',
                'p',
                'totalLiquidity',
                'subsidyPool',
                'prob',
                'probChanges',
                -- BINARY
                'initialProbability',
                -- NUMERIC
                'min',
                'max',
                -- 'BOUNTIED_QUESTION'
                'totalBounty',
                'bountyLeft',
                'isAutoBounty',
                -- cpmm-multi-1
                'shouldAnswersSumToOne',
                'addAnswersMode',
                'specialLiquidityPerAnswer'
                -- notable exclusions: resolution, resolutionProbability, resolutions, answers, options (poll))
            )
    );
begin
  if tg_op = 'INSERT' then
    insert into contract_financials (contract_id, mechanism, outcome_type, data)
    values (new.id, new.mechanism, new.outcome_type, new.data);
  elsif tg_op = 'UPDATE' then
    update contract_financials
    set mechanism = new.mechanism,
        outcome_type = new.outcome_type,
        data = new.data
    where contract_id = new.id;
  end if;
  return new;
end
$function$;

create trigger contract_financials_replication_trigger
after insert
or
update on contracts for each row
execute function contract_financials_replication_trigger_function ();

-- trigger for each row in contracts once
update contracts
set
  id = id;
