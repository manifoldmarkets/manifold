create or replace function jsonb_array_to_text_array(_js jsonb)
  returns text[]
  language sql immutable strict parallel safe as $$
select array(select jsonb_array_elements_text(_js))
$$;

create
or replace function recently_liked_contract_counts (since bigint) returns table (contract_id text, n int) immutable parallel safe language sql as $$
select data->>'contentId' as contract_id,
  count(*) as n
from user_reactions
where data->>'contentType' = 'contract'
  and data->>'createdTime' > since::text
group by contract_id $$;

create
or replace function get_recommended_contracts_embeddings (uid text, n int, excluded_contract_ids text[]) returns table (
  data jsonb,
  distance numeric,
  relative_dist numeric,
  popularity_score numeric
) immutable parallel safe language sql as $$ with user_embedding as (
    select interest_embedding
    from user_embeddings
    where user_id = uid
  )
select *
from get_recommended_contracts_embeddings_from(
    uid,
    (
      select interest_embedding
      from user_embedding
    ),
    n,
    excluded_contract_ids,
    0.25
  ) $$;

create
or replace function get_recommended_contracts_embeddings_topic (
  uid text,
  p_topic text,
  n int,
  excluded_contract_ids text[]
) returns table (
  data jsonb,
  distance numeric,
  relative_dist numeric,
  popularity_score numeric
) immutable parallel safe language sql as $$ with topic_embedding as (
    select embedding
    from topic_embeddings
    where topic_embeddings.topic = p_topic
  ),
  not_chosen_embedding as (
    select avg(embedding) as average
    from topic_embeddings
    where topic != p_topic
  ),
  embedding as (
    select (topic_embedding.embedding - not_chosen.average) as average
    from topic_embedding,
      not_chosen_embedding as not_chosen
  )
select *
from get_recommended_contracts_embeddings_from(
    uid,
    (
      select average
      from embedding
    ),
    n,
    excluded_contract_ids,
    0.1
  ) $$;

create
or replace function get_recommended_contracts_embeddings_from (
  uid text,
  p_embedding vector,
  n int,
  excluded_contract_ids text[],
  max_dist numeric
) returns table (
  data jsonb,
  distance numeric,
  relative_dist numeric,
  popularity_score numeric
) immutable parallel safe language sql as $$ with available_contracts_unscored as (
    select contract_id,
      p_embedding <=> ce.embedding as distance,
      (
        row_number() over (
          order by p_embedding <=> ce.embedding
        )
      ) / 2000.0 as relative_dist,
      lpc.popularity_score,
      lpc.created_time,
      lpc.close_time,
      jsonb_array_to_text_array(lpc.data->'groupSlugs') as group_slugs
    from contract_embeddings as ce
      join listed_open_contracts lpc on lpc.id = contract_id
    where not exists (
        select 1
        from unnest(excluded_contract_ids) as w
        where w = contract_id
      ) -- That has not been swiped on within 2 weeks.
      and not exists(
        select 1
        from user_seen_markets
        where user_seen_markets.user_id = uid
          and user_seen_markets.contract_id = ce.contract_id
          and (user_seen_markets.data->>'createdTime')::bigint > ts_to_millis(now() - interval '2 weeks')
      ) -- That has not been viewed as a card in the last day.
      and not exists(
        select 1
        from user_events
        where user_events.user_id = uid
          and user_events.name = 'view market card'
          and user_events.contract_id = ce.contract_id
          and user_events.ts > now() - interval '2 days'
      )
    order by p_embedding <=> ce.embedding -- Find many that are close to your interests
      -- so that among them we can filter for new, closing soon, and trending.
    limit 2000
  ), available_contracts as (
    select *,
      (
        case
          when close_time <= NOW() + interval '1 day' then 1
          when close_time <= NOW() + interval '1 week' then 0.9
          when close_time <= NOW() + interval '1 month' then 0.75
          when close_time <= NOW() + interval '3 months' then 0.5
          when close_time <= NOW() + interval '1 year' then 0.33
          else 0.25
        end
      ) * (log(coalesce(popularity_score, 0) + 2) / (relative_dist + 0.1))
        * (
        case
          when
            'gambling' = ANY(group_slugs) OR
            'whale-watching' = ANY(group_slugs) OR
            'selfresolving' = ANY(group_slugs)
          then 0.25
          else 1
        end
      )
        as score
    from available_contracts_unscored
  ),
  new_contracts as (
    select *,
      row_number() over (
        order by score desc
      ) as row_num
    from available_contracts
    where created_time > (now() - interval '1 day')
      and close_time > (now() + interval '1 day')
      and relative_dist < max_dist
    order by score desc
    limit n / 6
  ), closing_soon_contracts as (
    select *,
      row_number() over (
        order by score desc
      ) as row_num
    from available_contracts
    where close_time < (now() + interval '1 day')
      and relative_dist < max_dist
    order by score desc
    limit n / 6
  ), combined_new_closing_soon as (
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
  trending_contracts as (
    select *
    from available_contracts
    where created_time < (now() - interval '1 day')
      and close_time > (now() + interval '1 day')
      and popularity_score >= 0
  ),
  trending_results1 as (
    select *,
      row_number() over (
        order by score desc
      ) as row_num
    from trending_contracts
    where relative_dist < max_dist / 4
    limit 1 + (
        n - (
          select count(*)
          from combined_new_closing_soon
        )
      ) / 3
  ),
  trending_results2 as (
    select *,
      row_number() over (
        order by score desc
      ) as row_num
    from trending_contracts
    where relative_dist >= max_dist / 4
      and relative_dist < max_dist / 2
    limit 1 + (
        n - (
          select count(*)
          from combined_new_closing_soon
        )
      ) / 3
  ),
  trending_results3 as (
    select *,
      row_number() over (
        order by score desc
      ) as row_num
    from trending_contracts
    where relative_dist >= max_dist / 2
      and relative_dist < max_dist
    limit 1 + (
        n - (
          select count(*)
          from combined_new_closing_soon
        )
      ) / 3
  ),
  combined_trending as (
    select *,
      1 as result_id
    from trending_results1
    union all
    select *,
      2 as result_id
    from trending_results2
    union all
    select *,
      3 as result_id
    from trending_results3
    order by row_num,
      result_id
  ),
  excluded_contracts as (
    select contract_id
    from combined_trending
    union all
    select contract_id
    from combined_new_closing_soon
    union all
    select unnest(excluded_contract_ids) as contract_id
  ),
  contracts_with_liked_comments as (
    select
      ac.*,
      3 as result_id,
      row_number() over (
        order by score desc
        ) as row_num
    from get_contracts_with_unseen_liked_comments(
   array(select contract_id from available_contracts),
   array(select contract_id from excluded_contracts),
   uid,
   n / 6
     ) as cwc
   join available_contracts ac on ac.contract_id = cwc.contract_id
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
    union all
    select
      *,
      3 as result_id2,
      row_number() over (
        order by row_num,
          result_id
        ) as row_num2
    from contracts_with_liked_comments
    order by row_num2,
      result_id2
  )
select data,
  distance,
  relative_dist,
  combined_results.popularity_score
from combined_results
  join contracts on contracts.id = combined_results.contract_id
$$;

create
or replace function get_cpmm_pool_prob (pool jsonb, p numeric) returns numeric language plpgsql immutable parallel safe as $$
declare p_no numeric := (pool->>'NO')::numeric;
p_yes numeric := (pool->>'YES')::numeric;
no_weight numeric := p * p_no;
yes_weight numeric := (1 - p) * p_yes + p * p_no;
begin return case
  when yes_weight = 0 then 1
  else (no_weight / yes_weight)
end;
end $$;

create
or replace function get_cpmm_resolved_prob (data jsonb) returns numeric language sql immutable parallel safe as $$
select case
    when data->>'resolution' = 'YES' then 1
    when data->>'resolution' = 'NO' then 0
    when data->>'resolution' = 'MKT'
    and data ? 'resolutionProbability' then (data->'resolutionProbability')::numeric
    else null
  end $$;

create
or replace function ts_to_millis (ts timestamptz) returns bigint language sql immutable parallel safe as $$
select (
    extract(
      epoch
      from ts
    ) * 1000
  )::bigint $$;

create
or replace function millis_to_ts (millis bigint) returns timestamptz language sql immutable parallel safe as $$
select to_timestamp(millis / 1000.0) $$;

create
or replace function millis_interval (start_millis bigint, end_millis bigint) returns interval language sql immutable parallel safe as $$
select millis_to_ts(end_millis) - millis_to_ts(start_millis) $$;

create
or replace function get_time () returns bigint language sql stable parallel safe as $$
select ts_to_millis(now()) $$;

create
or replace function is_valid_contract (ct contracts) returns boolean stable parallel safe as $$
select ct.resolution_time is null
  and ct.visibility = 'public'
  and ct.close_time > now() + interval '10 minutes' $$ language sql;

create
or replace function search_contracts_by_group_slugs (group_slugs text[], lim int, start int) returns jsonb[] immutable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
      and is_valid_contract(contracts)
    order by popularity_score desc,
      data->'slug' offset start
    limit lim
  ) as search_contracts $$;

create
or replace function search_contracts_by_group_slugs_for_creator (
  creator_id text,
  group_slugs text[],
  lim int,
  start int
) returns jsonb[] immutable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where data->'groupSlugs' ?| group_slugs
      and is_valid_contract(contracts)
      and contracts.creator_id = $1
    order by popularity_score desc,
      data->'slug' offset start
    limit lim
  ) as search_contracts $$;

create
or replace function get_contract_metrics_with_contracts (uid text, count int, start int) returns table (contract_id text, metrics jsonb, contract jsonb) immutable parallel safe language sql as $$
select ucm.contract_id,
  ucm.data as metrics,
  c.data as contract
from user_contract_metrics as ucm
  join contracts_rbac as c on c.id = ucm.contract_id
where ucm.user_id = uid
  and ucm.data->'lastBetTime' is not null
order by ((ucm.data)->'lastBetTime')::bigint desc offset start
limit count $$;

create
or replace function get_open_limit_bets_with_contracts (uid text, count int) returns table (contract_id text, bets jsonb[], contract jsonb) immutable parallel safe language sql as $$;
select contract_id,
  bets.data as bets,
  contracts.data as contracts
from (
    select contract_id,
      array_agg(
        data
        order by created_time desc
      ) as data
    from contract_bets
    where user_id = uid
      and (data->>'isFilled')::boolean = false
      and (data->>'isCancelled')::boolean = false
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
limit count $$;

create
or replace function get_user_bets_from_resolved_contracts (uid text, count int, start int) returns table (contract_id text, bets jsonb[], contract jsonb) immutable parallel safe language sql as $$;
select contract_id,
  bets.data as bets,
  contracts.data as contracts
from (
    select contract_id,
      array_agg(
        data
        order by created_time desc
      ) as data
    from contract_bets
    where user_id = uid
      and amount != 0
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
where contracts.resolution_time is not null
  and contracts.outcome_type = 'BINARY'
limit count offset start $$;

create
or replace function get_contracts_by_creator_ids (creator_ids text[], created_time bigint) returns table (creator_id text, contracts jsonb) immutable parallel safe language sql as $$
select creator_id,
  jsonb_agg(data) as contracts
from contracts
where creator_id = any(creator_ids)
  and contracts.created_time > millis_to_ts($2)
group by creator_id;
$$;

create table if not exists
  discord_users (
    discord_user_id text not null,
    api_key text not null,
    user_id text not null,
    primary key (discord_user_id)
  );

alter table discord_users enable row level security;

create table if not exists
  discord_messages_markets (
    message_id text not null,
    market_id text not null,
    market_slug text not null,
    channel_id text not null,
    last_updated_thread_time bigint,
    thread_id text,
    primary key (message_id)
  );

alter table discord_messages_markets enable row level security;

create
or replace function get_your_contract_ids (uid text) returns table (contract_id text) immutable parallel safe language sql as $$ with your_liked_contracts as (
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

create
or replace function get_your_daily_changed_contracts (uid text, n int, start int) returns table (data jsonb, daily_score real) immutable parallel safe language sql as $$
select data,
  coalesce((data->>'dailyScore')::real, 0.0) as daily_score
from get_your_contract_ids(uid)
  left join contracts on contracts.id = contract_id
where contracts.outcome_type = 'BINARY'
order by daily_score desc
limit n offset start $$;

create
or replace function get_your_trending_contracts (uid text, n int, start int) returns table (data jsonb, score real) immutable parallel safe language sql as $$
select data,
  popularity_score as score
from get_your_contract_ids(uid)
  left join contracts on contracts.id = contract_id
where is_valid_contract(contracts)
  and contracts.outcome_type = 'BINARY'
order by score desc
limit n offset start $$;

-- Your most recent contracts by bets or likes.
create
or replace function get_your_recent_contracts (uid text, n int, start int) returns table (data jsonb, max_ts bigint) immutable parallel safe language sql as $$ with your_bet_on_contracts as (
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

create
or replace function get_contract_metrics_grouped_by_user_ids (uids text[], period text) returns table (user_id text, contract_metrics jsonb[]) immutable parallel safe language sql as $$
select ucm.user_id,
  array_agg(ucm.data) as contract_metrics
from user_contract_metrics as ucm
where ucm.user_id in (
    select unnest(uids)
  )
  and (ucm.data->'from'->period->'profit') is not null
  and abs((ucm.data->'from'->period->'profit')::bigint) > 1
group by ucm.user_id $$;

create
or replace function search_contract_embeddings (
  query_embedding vector (1536),
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

create
or replace function closest_contract_embeddings (
  input_contract_id text,
  similarity_threshold float,
  match_count int
) returns table (contract_id text, similarity float, data jsonb) language sql as $$ WITH embedding AS (
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

create
or replace function get_top_market_ads (uid text) returns table (
  ad_id text,
  market_id text,
  ad_funds numeric,
  ad_cost_per_view numeric,
  market_data jsonb
) language sql parallel safe as $$
--with all the redeemed ads (has a txn)
with redeemed_ad_ids as (
  select
    data->>'fromId' as fromId
  from
    txns
  where
    data->>'category' = 'MARKET_BOOST_REDEEM'
    and data->>'toId' = uid
),
-- with the user embedding
user_embedding as (
  select interest_embedding
  from user_embeddings
  where user_id = uid
),
--with all the ads that haven't been redeemed, by closest to your embedding
unredeemed_market_ads as (
select
  id, market_id, funds, cost_per_view
from market_ads
where 
  NOT EXISTS (
    SELECT 1
    FROM redeemed_ad_ids
    WHERE fromId = market_ads.id
  )
  and market_ads.funds > 0
  order by embedding <=> (
    select interest_embedding
    from user_embedding
  )
  limit 50
)
select 
  ma.id,
  ma.market_id,
  ma.funds,
  ma.cost_per_view,
  contracts.data
 from 
 unredeemed_market_ads as ma
inner join contracts
on contracts.id = ma.market_id
$$;

create
or replace function save_user_topics (p_user_id text, p_topics text[]) returns void language sql as $$ with chosen_embedding as (
    select avg(embedding) as average
    from topic_embeddings
    where topic = any(p_topics)
  ),
  not_chosen_embedding as (
    select avg(embedding) as average
    from topic_embeddings
    where topic not in (
        select unnest(p_topics)
      )
  ),
  topic_embedding as (
    select (chosen.average - not_chosen.average) as average
    from chosen_embedding as chosen,
      not_chosen_embedding as not_chosen
  )
insert into user_topics (user_id, topics, topic_embedding)
values (
    p_user_id,
    p_topics,
    (
      select average
      from topic_embedding
    )
  ) on conflict (user_id) do
update
set topics = excluded.topics,
  topic_embedding = excluded.topic_embedding;
$$;

create
  or replace function save_user_topics_blank (p_user_id text) returns void language sql as $$
with
  average_all as (
    select avg(embedding) as average
    from topic_embeddings
  ),
  ignore_embeddings as (
    select avg(embedding) as average
    from topic_embeddings
    where topic in (
      select unnest(ARRAY['destiny.gg', 'stock', 'planecrash', 'proofnik', 'permanent', 'personal']::text[])
    )
  ),
  topic_embedding as (
    select (avg_all.average - not_chosen.average) as average
    from average_all as avg_all,
         ignore_embeddings as not_chosen
  )
insert into user_topics (user_id, topics, topic_embedding)
values (
         p_user_id,
         ARRAY['']::text[],
         (
           select average
           from topic_embedding
         )
       ) on conflict (user_id) do
  update set topics = excluded.topics,
             topic_embedding = excluded.topic_embedding;
$$;

create
or replace function firebase_uid () returns text language sql stable parallel safe as $$
select nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )::text;
$$;


CREATE OR REPLACE FUNCTION get_reply_chain_comments_matching_contracts(contract_ids TEXT[], past_time_ms BIGINT)
  RETURNS TABLE (
                  id text,
                  contract_id text,
                  data JSONB
              ) AS $$
  WITH matching_comments AS (
      SELECT
          c1.comment_id AS id,
          c1.contract_id,
          c1.data
      FROM
          contract_comments c1
      WHERE
              c1.contract_id = ANY(contract_ids)
        AND (c1.data -> 'createdTime')::BIGINT >= past_time_ms
  ),
       reply_chain_comments AS (
           SELECT
               c2.comment_id AS id,
               c2.contract_id,
               c2.data
           FROM
               contract_comments c2
                   JOIN matching_comments mc
                        ON c2.contract_id = mc.contract_id
                            AND c2.data ->> 'replyToCommentId' = mc.data ->> 'replyToCommentId'
                            AND c2.data->>'id' != mc.id
       ),
       parent_comments AS (
           SELECT
               c3.comment_id AS id,
               c3.contract_id,
               c3.data
           FROM
               contract_comments c3
                   JOIN matching_comments mc
                        ON c3.contract_id = mc.contract_id
                            AND c3.data ->> 'id' = mc.data ->> 'replyToCommentId'
       )
  SELECT * FROM matching_comments
  UNION ALL
  SELECT * FROM parent_comments
  UNION ALL
  SELECT * FROM reply_chain_comments;
$$ LANGUAGE sql;


create or replace function get_contracts_with_unseen_liked_comments(
  available_contract_ids text[],
  excluded_contract_ids text[],
  current_user_id text,
  limit_count integer
)
  returns table (
                  contract_id text,
                  comment_id text,
                  user_id text,
                  data jsonb
                ) as $$
select
  filtered_comments.contract_id,
  filtered_comments.comment_id,
  filtered_comments.user_id,
  filtered_comments.data
from (
       select distinct on (comments.contract_id)
         comments.contract_id,
         comments.comment_id,
         comments.user_id,
         comments.data,
         (comments.data->>'createdTime')::bigint as created_time
       from
         liked_sorted_comments comments
       where
           comments.contract_id = any (available_contract_ids) and
           comments.contract_id <> all (excluded_contract_ids)
         and
         not (
             exists (
               select 1
               from user_events ue
               where
                   ue.user_id = current_user_id and
                     ue.name = 'view comment thread' and
                     ue.data->>'commentId' = comments.comment_id
             )
             or exists (
             select 1
             from user_events ue
             where
                 ue.user_id = current_user_id and
                   ue.name = 'view comment thread' and
                   ue.data->>'commentId' = comments.data->>'replyToCommentId'
           )
           )
       order by
         comments.contract_id,
         created_time desc) as filtered_comments
order by
  filtered_comments.created_time desc
limit limit_count;
$$ language sql;

CREATE OR REPLACE FUNCTION get_unseen_reply_chain_comments_matching_contracts(contract_ids TEXT[],current_user_id text)
  RETURNS TABLE (
                  id text,
                  contract_id text,
                  data JSONB
                ) AS $$
WITH matching_comments AS (
  SELECT
    c1.comment_id AS id,
    c1.contract_id,
    c1.data
  FROM
    contract_comments c1
  WHERE
      c1.contract_id = ANY(contract_ids)
    AND
    not (
        exists (
          select 1
          from user_events ue
          where
              ue.user_id = current_user_id and
              ue.name = 'view comment thread' and
                ue.data->>'commentId' = c1.comment_id
        )
        or exists (
        select 1
        from user_events ue
        where
            ue.user_id = current_user_id and
            ue.name = 'view comment thread' and
              ue.data->>'commentId' = c1.data->>'replyToCommentId'
      )
      )
),
     reply_chain_comments AS (
       SELECT
         c2.comment_id AS id,
         c2.contract_id,
         c2.data
       FROM
         contract_comments c2
           JOIN matching_comments mc
                ON c2.contract_id = mc.contract_id
                  AND c2.data ->> 'replyToCommentId' = mc.data ->> 'replyToCommentId'
                  AND c2.data->>'id' != mc.id
     ),
     parent_comments AS (
       SELECT
         c3.comment_id AS id,
         c3.contract_id,
         c3.data
       FROM
         contract_comments c3
           JOIN matching_comments mc
                ON c3.contract_id = mc.contract_id
                  AND c3.data ->> 'id' = mc.data ->> 'replyToCommentId'
     )
SELECT * FROM matching_comments
UNION ALL
SELECT * FROM parent_comments
UNION ALL
SELECT * FROM reply_chain_comments;
$$ LANGUAGE sql;
