-- Get the dot product of two vectors stored as rows in two tables.
create or replace function dot(
    urf user_recommendation_features,
    crf contract_recommendation_features
  ) returns real immutable parallel safe language sql as $$
select round(
    (
      urf.f0 * crf.f0 + urf.f1 * crf.f1 + urf.f2 * crf.f2 + urf.f3 * crf.f3 + urf.f4 * crf.f4
    ) * 10000
  ) / 10000;
$$;
create or replace function calculate_distance(
    row1 contract_recommendation_features,
    row2 contract_recommendation_features
  ) returns float language sql immutable parallel safe as $$
select sqrt(
    (row1.f0 - row2.f0) ^ 2 + (row1.f1 - row2.f1) ^ 2 + (row1.f2 - row2.f2) ^ 2 + (row1.f3 - row2.f3) ^ 2 + (row1.f4 - row2.f4) ^ 2
  ) $$;
create or replace function recently_liked_contract_counts(since bigint) returns table (contract_id text, n int) immutable parallel safe language sql as $$
select data->>'contentId' as contract_id,
  count(*) as n
from user_reactions
where data->>'contentType' = 'contract'
  and data->>'createdTime' > since::text
group by contract_id $$;
-- Use cached tables of user and contract features to computed the top scoring
-- markets for a user.
create or replace function get_recommended_contract_scores(uid text) returns table (contract_id text, score real) immutable parallel safe language sql as $$
select crf.contract_id,
  dot(urf, crf) as score
from user_recommendation_features as urf
  cross join contract_recommendation_features as crf
where user_id = uid
order by score desc $$;
create or replace function get_recommended_contract_scores_unseen(uid text) returns table (contract_id text, score real) immutable parallel safe language sql as $$
select crf.contract_id,
  coalesce(dot(urf, crf) * crf.freshness_score, 0.0) as score
from user_recommendation_features as urf
  cross join contract_recommendation_features as crf
where user_id = uid -- That has not been viewed.
  and not exists (
    select 1
    from user_events
    where user_events.user_id = uid
      and user_events.data->>'name' = 'view market'
      and user_events.data->>'contractId' = crf.contract_id
  ) -- That has not been swiped on.
  and not exists (
    select 1
    from user_seen_markets
    where user_seen_markets.user_id = uid
      and user_seen_markets.contract_id = crf.contract_id
  ) -- That has not been viewed as a card recently.
  and not exists (
    select 1
    from user_events
    where user_events.user_id = uid
      and user_events.data->>'name' = 'view market card'
      and user_events.data->>'contractId' = crf.contract_id
      and (user_events.data->'timestamp')::bigint > ts_to_millis(now() - interval '1 day')
  )
order by score desc $$;
create or replace function get_recommended_contracts_by_score_excluding(
    uid text,
    count int,
    excluded_contract_ids text []
  ) returns table (data jsonb, score real) immutable parallel safe language sql as $$
select data,
  score
from get_recommended_contract_scores_unseen(uid)
  left join contracts on contracts.id = contract_id
where is_valid_contract(contracts)
  and outcome_type = 'BINARY' -- Not in the list of contracts to exclude.
  and not exists (
    select 1
    from unnest(excluded_contract_ids) as w
    where w = contract_id
  )
limit count $$;
create or replace function get_recommended_contract_set(uid text, n int, excluded_contract_ids text []) returns table (data jsonb, score real) immutable parallel safe language sql as $$ with recommendation_scores as materialized (
    select contract_id,
      score
    from get_recommended_contract_scores_unseen(uid)
    order by score desc
  ),
  recommended_contracts as not materialized (
    select data,
      created_time,
      score
    from recommendation_scores
      left join contracts on contracts.id = contract_id
    where is_valid_contract(contracts)
      and outcome_type = 'BINARY'
      and not exists (
        select 1
        from unnest(excluded_contract_ids) as w
        where w = contract_id
      )
    order by score desc
  ),
  new_contracts as (
    select data,
      score
    from recommended_contracts
    where created_time > now() - interval '1 day'
    order by score desc
    limit floor(n / 3)
  ), trending_contracts as (
    select data,
      score
    from recommended_contracts
    where created_time < now() - interval '1 day'
    order by score desc
    limit n - (
        select count(*)
        from new_contracts
      )
  )
select data,
  score
from new_contracts
union all
select data,
  score
from trending_contracts
order by score desc $$;
create or replace function get_recommended_contracts(uid text, n int, excluded_contract_ids text []) returns setof jsonb language plpgsql as $$ begin create temp table your_recs on commit drop as (
    select *
    from get_recommended_contract_set(uid, n, excluded_contract_ids)
  );
if (
  select count(*)
  from your_recs
) = n then return query
select data
from your_recs;
else -- Default recommendations from this particular user if none for you.
return query (
  select data
  from your_recs
  union all
  select data
  from get_recommended_contract_set(
      'Nm2QY6MmdnOu1HJUBcoG2OV2dQF2',
      n,
      excluded_contract_ids
    )
  limit n
);
end if;
end $$;
create or replace function get_recommended_contracts_embeddings(uid text, n int, excluded_contract_ids text []) returns table (
    data jsonb,
    distance numeric,
    popularity_score numeric
  ) immutable parallel safe language sql as $$ with user_embedding as (
    select interest_embedding
    from user_embeddings
    where user_id = uid
  ),
  available_contracts as (
    select contract_id,
      (
        select interest_embedding
        from user_embedding
      ) <=> ce.embedding as distance,
      lpc.popularity_score,
      lpc.created_time,
      lpc.close_time
    from contract_embeddings as ce
      join listed_open_contracts lpc on lpc.id = contract_id
    where not exists (
        select 1
        from unnest(excluded_contract_ids) as w
        where w = contract_id
      ) -- That has not been viewed.
      and not exists (
        select 1
        from user_events
        where user_events.user_id = uid
          and user_events.data->>'name' = 'view market'
          and user_events.data->>'contractId' = contract_id
      ) -- That has not been swiped on.
      and not exists(
        select 1
        from user_seen_markets
        where user_seen_markets.user_id = uid
          and user_seen_markets.contract_id = ce.contract_id
      ) -- That has not been viewed as a card recently.
      and not exists(
        select 1
        from user_events
        where user_events.user_id = uid
          and user_events.data->>'name' = 'view market card'
          and user_events.data->>'contractId' = contract_id
          and (user_events.data->'timestamp')::bigint > ts_to_millis(now() - interval '1 day')
      )
    order by (
        select interest_embedding
        from user_embedding
      ) <=> ce.embedding -- Find many that are close to your interests
      -- so that among them we can filter for new, closing soon, and trending.
    limit 2000
  ), new_contracts as (
    select *,
      row_number() over (
        order by distance
      ) as row_num
    from available_contracts
    where created_time > (now() - interval '1 day')
      and close_time > (now() + interval '1 day')
      and distance < 0.12
    order by distance
    limit n / 5
  ), closing_soon_contracts as (
    select *,
      row_number() over (
        order by distance
      ) as row_num
    from available_contracts
    where close_time < (now() + interval '1 day')
      and distance < 0.12
    order by distance
    limit n / 5
  ), trending_contracts as (
    select *
    from available_contracts
    where created_time < (now() - interval '1 day')
      and close_time > (now() + interval '1 day')
      and popularity_score >= 0
  ),
  results1 as (
    select *,
      row_number() over (
        order by popularity_score desc
      ) as row_num
    from trending_contracts
    where distance < 0.10
    limit n / 5
  ), results2 as (
    select *,
      row_number() over (
        order by popularity_score desc
      ) as row_num
    from trending_contracts
    where distance >= 0.10
      and distance < 0.12
    limit n / 5
  ), results3 as (
    select *,
      row_number() over (
        order by popularity_score desc
      ) as row_num
    from trending_contracts
    where distance >= 0.12
      and distance < 0.14
    limit n / 5
  ), combined_trending as (
    select *,
      1 as result_id
    from results1
    union all
    select *,
      2 as result_id
    from results2
    union all
    select *,
      3 as result_id
    from results3
    order by row_num,
      result_id
  ),
  combined_new_closing_soon as (
    select *,
      1 as result_id
    from new_contracts
    union all
    select *,
      2 as result_id
    from closing_soon_contracts
    order by row_num,
      result_id
  ),
  combined_results as (
    select *,
      1 as result_id2,
      row_number() over (
        order by row_num,
          result_id
      ) as row_num2
    from combined_trending
    union all
    select *,
      2 as result_id2,
      row_number() over (
        order by row_num,
          result_id
      ) as row_num2
    from combined_new_closing_soon
    order by row_num2,
      result_id2
  )
select data,
  distance,
  combined_results.popularity_score
from combined_results
  join contracts on contracts.id = combined_results.contract_id $$;
create or replace function get_cpmm_pool_prob(pool jsonb, p numeric) returns numeric language plpgsql immutable parallel safe as $$
declare p_no numeric := (pool->>'NO')::numeric;
p_yes numeric := (pool->>'YES')::numeric;
no_weight numeric := p * p_no;
yes_weight numeric := (1 - p) * p_yes + p * p_no;
begin return case
  when yes_weight = 0 then 1
  else (no_weight / yes_weight)
end;
end $$;
create or replace function get_cpmm_resolved_prob(data jsonb) returns numeric language sql immutable parallel safe as $$
select case
    when data->>'resolution' = 'YES' then 1
    when data->>'resolution' = 'NO' then 0
    when data->>'resolution' = 'MKT'
    and data ? 'resolutionProbability' then (data->'resolutionProbability')::numeric
    else null
  end $$;
create or replace function ts_to_millis(ts timestamptz) returns bigint language sql immutable parallel safe as $$
select (
    extract(
      epoch
      from ts
    ) * 1000
  )::bigint $$;
create or replace function millis_to_ts(millis bigint) returns timestamptz language sql immutable parallel safe as $$
select to_timestamp(millis / 1000.0) $$;
create or replace function millis_interval(start_millis bigint, end_millis bigint) returns interval language sql immutable parallel safe as $$
select millis_to_ts(end_millis) - millis_to_ts(start_millis) $$;
create or replace function get_time() returns bigint language sql stable parallel safe as $$
select ts_to_millis(now()) $$;
create or replace function is_valid_contract(ct contracts) returns boolean stable parallel safe as $$
select ct.resolution_time is null
  and ct.visibility = 'public'
  and ct.close_time > now() + interval '10 minutes' $$ language sql;
create or replace function get_related_contract_ids(source_id text) returns table(contract_id text, distance float) immutable parallel safe language sql as $$ with target_contract as (
    select *
    from contract_recommendation_features
    where contract_id = source_id
  )
select crf.contract_id,
  calculate_distance(crf, target_contract) as distance
from contract_recommendation_features as crf,
  target_contract
where crf.contract_id != target_contract.contract_id
order by distance $$;
create or replace function get_related_contracts(cid text, lim int, start int) returns JSONB [] immutable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from get_related_contract_ids(cid)
      left join contracts on contracts.id = contract_id
    where is_valid_contract(contracts)
    limit lim offset start
  ) as rel_contracts $$;
create or replace function search_contracts_by_group_slugs(group_slugs text [], lim int, start int) returns jsonb [] immutable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
      and is_valid_contract(contracts)
    order by (data->'uniqueBettors7Days')::int desc,
      data->'slug' offset start
    limit lim
  ) as search_contracts $$;
create or replace function search_contracts_by_group_slugs_for_creator(
    creator_id text,
    group_slugs text [],
    lim int,
    start int
  ) returns jsonb [] immutable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
      and is_valid_contract(contracts)
      and contracts.creator_id = $1
    order by (data->'uniqueBettors7Days')::int desc,
      data->'slug' offset start
    limit lim
  ) as search_contracts $$;
create or replace function get_contract_metrics_with_contracts(uid text, count int, start int) returns table(contract_id text, metrics jsonb, contract jsonb) immutable parallel safe language sql as $$
select ucm.contract_id,
  ucm.data as metrics,
  c.data as contract
from user_contract_metrics as ucm
  join contracts as c on c.id = ucm.contract_id
where ucm.user_id = uid
  and ucm.data->'lastBetTime' is not null
order by ((ucm.data)->'lastBetTime')::bigint desc offset start
limit count $$;
create or replace function get_open_limit_bets_with_contracts(uid text, count int) returns table(contract_id text, bets jsonb [], contract jsonb) immutable parallel safe language sql as $$;
select contract_id,
  bets.data as bets,
  contracts.data as contracts
from (
    select contract_id,
      array_agg(
        data
        order by (data->>'createdTime') desc
      ) as data
    from contract_bets
    where (data->>'userId') = uid
      and (data->>'isFilled')::boolean = false
      and (data->>'isCancelled')::boolean = false
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
limit count $$;
create or replace function get_user_bets_from_resolved_contracts(uid text, count int, start int) returns table(contract_id text, bets jsonb [], contract jsonb) immutable parallel safe language sql as $$;
select contract_id,
  bets.data as bets,
  contracts.data as contracts
from (
    select contract_id,
      array_agg(
        data
        order by (data->>'createdTime') desc
      ) as data
    from contract_bets
    where (data->>'userId') = uid
      and (data->>'amount')::real != 0
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
where contracts.resolution_time is not null
  and contracts.outcome_type = 'BINARY'
limit count offset start $$;
create or replace function get_contracts_by_creator_ids(creator_ids text [], created_time bigint) returns table(creator_id text, contracts jsonb) immutable parallel safe language sql as $$
select creator_id,
  jsonb_agg(data) as contracts
from contracts
where creator_id = any(creator_ids)
  and contracts.created_time > millis_to_ts($2)
group by creator_id;
$$;
create table if not exists discord_users (
  discord_user_id text not null,
  api_key text not null,
  user_id text not null,
  primary key(discord_user_id)
);
alter table discord_users enable row level security;
create table if not exists discord_messages_markets (
  message_id text not null,
  market_id text not null,
  market_slug text not null,
  channel_id text not null,
  last_updated_thread_time bigint,
  thread_id text,
  primary key(message_id)
);
alter table discord_messages_markets enable row level security;
create or replace function get_your_contract_ids(uid text) returns table (contract_id text) immutable parallel safe language sql as $$ with your_liked_contracts as (
    select (data->>'contentId') as contract_id
    from user_reactions
    where user_id = uid
  ),
  your_followed_contracts as (
    select contract_id
    from contract_follows
    where follow_id = uid
  )
select contract_id
from your_liked_contracts
union
select contract_id
from your_followed_contracts $$;
create or replace function get_your_daily_changed_contracts(uid text, n int, start int) returns table (data jsonb, daily_score real) immutable parallel safe language sql as $$
select data,
  coalesce((data->>'dailyScore')::real, 0.0) as daily_score
from get_your_contract_ids(uid)
  left join contracts on contracts.id = contract_id
where contracts.outcome_type = 'BINARY'
order by daily_score desc
limit n offset start $$;
create or replace function get_your_trending_contracts(uid text, n int, start int) returns table (data jsonb, score real) immutable parallel safe language sql as $$
select data,
  popularity_score as score
from get_your_contract_ids(uid)
  left join contracts on contracts.id = contract_id
where is_valid_contract(contracts)
  and contracts.outcome_type = 'BINARY'
order by score desc
limit n offset start $$;
-- Your most recent contracts by bets or likes.
create or replace function get_your_recent_contracts(uid text, n int, start int) returns table (data jsonb, max_ts bigint) immutable parallel safe language sql as $$ with your_bet_on_contracts as (
    select contract_id,
      (data->>'lastBetTime')::bigint as ts
    from user_contract_metrics
    where user_id = uid
      and (data->>'lastBetTime')::bigint is not null
  ),
  your_liked_contracts as (
    select (data->>'contentId') as contract_id,
      (data->>'createdTime')::bigint as ts
    from user_reactions
    where user_id = uid
  ),
  recent_contract_ids as (
    select contract_id,
      ts
    from your_bet_on_contracts
    union all
    select contract_id,
      ts
    from your_liked_contracts
  ),
  recent_unique_contract_ids as (
    select contract_id,
      max(ts) AS max_ts
    from recent_contract_ids
    group by contract_id
  )
select data,
  max_ts
from recent_unique_contract_ids
  left join contracts on contracts.id = contract_id
where data is not null
order by max_ts desc
limit n offset start $$;
create or replace function get_contract_metrics_grouped_by_user_ids(uids text [], period text) returns table(user_id text, contract_metrics jsonb []) immutable parallel safe language sql as $$
select ucm.user_id,
  array_agg(ucm.data) as contract_metrics
from user_contract_metrics as ucm
where ucm.user_id in (
    select unnest(uids)
  )
  and (ucm.data->'from'->period->'profit') is not null
  and abs((ucm.data->'from'->period->'profit')::bigint) > 1
group by ucm.user_id $$;
create or replace function search_contract_embeddings (
    query_embedding vector(1536),
    similarity_threshold float,
    match_count int
  ) returns table (contract_id text, similarity float) language plpgsql as $$ begin return query
select contract_embeddings.contract_id as contract_id,
  1 - (
    contract_embeddings.embedding <=> query_embedding
  ) as similarity
from contract_embeddings
where 1 - (
    contract_embeddings.embedding <=> query_embedding
  ) > similarity_threshold
order by contract_embeddings.embedding <=> query_embedding
limit match_count;
end;
$$;
create or replace function closest_contract_embeddings (
    input_contract_id text,
    similarity_threshold float,
    match_count int
  ) returns table (
    contract_id text,
    similarity float,
    data jsonb
  ) language sql as $$ WITH embedding AS (
    SELECT embedding
    FROM contract_embeddings
    WHERE contract_id = input_contract_id
  )
SELECT contract_id,
  similarity,
  data
FROM search_contract_embeddings(
    (
      SELECT embedding
      FROM embedding
    ),
    similarity_threshold,
    match_count + 10
  )
  join contracts on contract_id = contracts.id
where contract_id != input_contract_id
  and resolution_time is null
order by similarity * similarity * log(popularity_score + 100) desc
limit match_count;
$$;
create or replace function firebase_uid() returns text language sql stable parallel safe as $$
select nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::text;
$$;