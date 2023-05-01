create
or replace function user_contract_metric_populate_cols () returns trigger language plpgsql as $$ begin 
    if new.data is not null then 
    new.has_yes_shares := ((new.data)->'hasYesShares')::boolean;
    new.has_no_shares := ((new.data)->'hasNoShares')::boolean;
    new.total_shares_yes := case
        when new.data->'totalShares' ? 'YES' then (((new.data)->'totalShares'->>'YES')::numeric)
        else null
    end;
    new.total_shares_no := case
        when new.data->'totalShares' ? 'NO' then (((new.data)->'totalShares'->>'NO')::numeric)
        else null
    end;
    new.profit := case
        when new.data ? 'profit' then (((new.data)->>'profit')::numeric)
        else null
    end;
    new.has_shares := ((new.data)->'hasShares')::boolean;
    end if;
    return new;
end $$;

create trigger user_contract_metrics_populate before insert
or
update on user_contract_metrics for each row
execute function user_contract_metric_populate_cols ();

update user_contract_metrics
set
  fs_updated_time = fs_updated_time
where
  has_shares is null;
