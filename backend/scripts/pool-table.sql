create table
  pools (
    contract_id text references contracts (id) not null,
    answer_id text references answers (id), -- null for cpmm-1
    p numeric, -- null for cpmm-multi-1
    yes numeric, -- null for cpmm-multi-1
    no numeric, -- null for cpmm-multi-1
    prob decimal(5, 5), -- null for cpmm-multi-1
    total_liquidity numeric not null default 0,
    subsidy_pool numeric not null default 0,
    primary key (contract_id, answer_id)
  );

create
or replace function copy_pool () returns trigger as $$
declare
    p numeric := (new.data->>'p')::numeric;
    yes numeric := (new.data->'pool'->>'YES')::numeric;
    no numeric := (new.data->'pool'->>'NO')::numeric;
    prob decimal(5, 5) := (new.data->>'prob')::decimal(5, 5);
    total_liquidity numeric := (new.data->>'totalLiquidity')::numeric;
    subsidy_pool numeric := (new.data->>'subsidyPool')::numeric;
begin
  if tg_op = 'INSERT' then
    insert into pools (contract_id, answer_id, p, yes, no, prob, total_liquidity, subsidy_pool)
    values (new.id, null, p, yes, no, prob, total_liquidity, subsidy_pool);
  elsif tg_op = 'UPDATE' then
    update pools
    set p = p,
        yes = yes,
        no = no,
        prob = prob,
        total_liquidity = total_liquidity,
        subsidy_pool = subsidy_pool
    where contract_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger copy_pool
after insert
or
update on contracts for each row when (new.mechanism = 'cpmm-1')
execute procedure copy_pool ();

-- Create full_contract view
create or replace view
  full_contract as
select
  c.*,
  p.p,
  p.yes,
  p.no,
  p.prob,
  p.total_liquidity,
  p.subsidy_pool
from
  contracts c
  left join pools p on c.id = p.contract_id;
