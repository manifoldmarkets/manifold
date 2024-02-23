create
or replace function jsonb_array_to_text_array (_js jsonb) returns text[] language sql immutable strict parallel safe as $$
select array(select jsonb_array_elements_text(_js))
$$;

create
or replace function recently_liked_contract_counts (since bigint) returns table (contract_id text, n int) stable parallel safe language sql as $$
select content_id as contract_id,
  count(*) as n
from user_reactions
where content_type = 'contract'
  and ts_to_millis(created_time) > since
group by contract_id $$;

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
  and ((ct.close_time > now() + interval '10 minutes') or ct.close_time is null) $$ language sql;

create
or replace function search_contracts_by_group_slugs_1 (p_group_slugs text[], lim int, start int) returns jsonb[] stable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where contracts.group_slugs && p_group_slugs
      and is_valid_contract(contracts)
    order by importance_score desc,
     slug offset start
    limit lim
  ) as search_contracts $$;

create
or replace function search_contracts_by_group_slugs_for_creator_1 (
  creator_id text,
  p_group_slugs text[],
  lim int,
  start int
) returns jsonb[] stable parallel safe language sql as $$
select array_agg(data)
from (
    select data
    from contracts
    where contracts.group_slugs && p_group_slugs
      and is_valid_contract(contracts)
      and contracts.creator_id = $1
    order by importance_score desc,
      slug offset start
    limit lim
  ) as search_contracts $$;

create
or replace function get_contract_metrics_with_contracts (uid text, count int, start int) returns table (contract_id text, metrics jsonb, contract jsonb) stable parallel safe language sql as $$
select ucm.contract_id,
  ucm.data as metrics,
    c.data as contract
from user_contract_metrics as ucm
    join contracts_rbac as c on c.id = ucm.contract_id
where ucm.user_id = uid
  and ucm.data->'lastBetTime' is not null
  and ucm.answer_id is null
order by ((ucm.data)->'lastBetTime')::bigint desc offset start
limit count $$;

create
    or replace function get_open_limit_bets_with_contracts_1
(uid text, count int, politics boolean)
    returns table (contract_id text, bets jsonb[], contract jsonb)
    stable parallel safe language sql as $$;
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
where (politics is false or is_politics = politics)
limit count $$;

create
or replace function get_user_bets_from_resolved_contracts (uid text, count int, start int) returns table (contract_id text, bets jsonb[], contract jsonb) stable parallel safe language sql as $$;
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
or replace function sample_resolved_bets (trader_threshold int, p numeric) returns table (prob numeric, is_yes boolean) stable parallel safe language sql as $$
select  0.5 * ((contract_bets.prob_before)::numeric + (contract_bets.prob_after)::numeric)  as prob, 
       ((contracts.resolution)::text = 'YES')::boolean as is_yes
from contract_bets
  join contracts on contracts.id = contract_bets.contract_id
where 
   contracts.outcome_type = 'BINARY'
  and (contracts.resolution = 'YES' or contracts.resolution = 'NO')
  and contracts.visibility = 'public'
  and (contracts.data->>'uniqueBettorCount')::int >= trader_threshold
  and amount > 0
  and random() < p
$$;

create
or replace function get_contracts_by_creator_ids (creator_ids text[], created_time bigint) returns table (creator_id text, contracts jsonb) stable parallel safe language sql as $$
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
or replace function get_your_contract_ids (uid text) returns table (contract_id text) stable parallel safe language sql as $$ with your_liked_contracts as (
    select content_id as contract_id
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
or replace function get_your_daily_changed_contracts (uid text, n int, start int) returns table (data jsonb, daily_score real) stable parallel safe language sql as $$
select data,
  coalesce((data->>'dailyScore')::real, 0.0) as daily_score
from get_your_contract_ids(uid)
  left join contracts on contracts.id = contract_id
where contracts.outcome_type = 'BINARY'
order by daily_score desc
limit n offset start $$;

-- Your most recent contracts by bets, likes, or views.
create
or replace function get_your_recent_contracts (uid text, n int, start int) returns table (data jsonb, max_ts bigint) stable parallel safe language sql as $$
    with your_bet_on_contracts as (
        select contract_id,
               (data->>'lastBetTime')::bigint as ts
        from user_contract_metrics
        where user_id = uid
          and ((data -> 'lastBetTime')::bigint) is not null
        order by ((data -> 'lastBetTime')::bigint) desc
        limit n),
    your_liked_contracts as (
         select content_id as contract_id,
               ts_to_millis(created_time) as ts
         from user_reactions
         where user_id = uid
         order by created_time desc
         limit n
    ),
     your_viewed_contracts as (
         select contract_id,
                ts_to_millis(created_time) as ts
         from user_seen_markets
         where user_id = uid
           and type = 'view market'
         order by created_time desc
         limit n
     ),
  recent_contract_ids as (
      select contract_id,ts
      from your_viewed_contracts
      union all
    select contract_id,ts
    from your_viewed_contracts
    union all
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
or replace function get_contract_metrics_grouped_by_user_ids (uids text[], period text) returns table (user_id text, contract_metrics jsonb[]) stable parallel safe language sql as $$
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

-- TODO: delete this function after 1/7/2024
create
or replace function closest_contract_embeddings (
  input_contract_id text,
  similarity_threshold float,
  match_count int,
  is_admin boolean default false
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
    match_count + 500
  )
  join contracts on contract_id = contracts.id
where contract_id != input_contract_id
  and resolution_time is null
    -- if function is being called by an admin, manually filter which contracts can be seen based on firebase_uid
    and (
    (is_admin = false)
    OR (is_admin = true and contracts.visibility = 'public')
    OR (is_admin = true and contracts.visibility = 'private' and firebase_uid() is not null and can_access_private_contract(contracts.id, firebase_uid()))
  )
order by similarity * similarity * importance_score desc
limit match_count;
$$;

-- TODO: remove politics only bits of this function, search is too shallow
create
or replace function close_contract_embeddings_1 (
  input_contract_id text,
  similarity_threshold float,
  match_count int,
  politics_only boolean default false
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
                 match_count + 500
         )
             join contracts on contract_id = contracts.id
    where contract_id != input_contract_id
      and resolution_time is null
      and contracts.visibility = 'public'
      and (politics_only is false or politics_only = contracts.is_politics)
    order by similarity * similarity * importance_score desc
    limit match_count;
$$;

create
or replace function close_politics_contract_embeddings (
  input_contract_id text,
  start int,
  match_count int
) returns table (contract_id text, similarity float, data jsonb) language sql as $$
    WITH query_embedding AS (
        SELECT embedding
        FROM contract_embeddings
        WHERE contract_id = input_contract_id
    ),
         politics_embeddings as
             (select embedding, contracts.* from contract_embeddings
                join contracts on contract_id = contracts.id
                where is_politics = true
                and contract_id != input_contract_id
                and resolution_time is null
                and contracts.visibility = 'public')
    select politics_embeddings.id as contract_id,
           1 - (politics_embeddings.embedding <=> (select embedding from query_embedding)) as similarity,
           politics_embeddings.data
    from politics_embeddings
        order by 1 - (politics_embeddings.embedding <=> (select embedding from query_embedding)) * importance_score desc
    limit match_count offset start;
$$;

create
or replace function get_market_ads (uid text) returns table (
  ad_id text,
  market_id text,
  ad_funds numeric,
  ad_cost_per_view numeric,
  market_data jsonb
) language sql parallel safe as $$
--with all the redeemed ads (has a txn)
with redeemed_ad_ids as (
  select
    from_id
  from
    txns
  where
    category = 'MARKET_BOOST_REDEEM'
    and to_id = uid
),
-- with the user embedding
user_embedding as (
    select interest_embedding, disinterest_embedding
    from user_embeddings
  where user_id = uid
),
--with all the ads that haven't been redeemed, by closest to your embedding
unredeemed_market_ads as (
  select
    id, market_id, funds, cost_per_view, embedding
  from
    market_ads
  where 
    market_ads.user_id != uid -- hide your own ads; comment out to debug
    and not exists (
      SELECT 1
      FROM redeemed_ad_ids
      WHERE from_id = market_ads.id
    )
    and market_ads.funds >= cost_per_view
    and coalesce(embedding <=> (select disinterest_embedding from user_embedding), 1) > 0.125
    order by cost_per_view * (1 - (embedding <=> (
    select interest_embedding
    from user_embedding
  ))) desc
  limit 50
),
--with all the unique market_ids
unique_market_ids as (
  select distinct market_id
  from unredeemed_market_ads
),
--with the top ad for each unique market_id
top_market_ads as (
  select
    id, market_id, funds, cost_per_view
  from
    unredeemed_market_ads
  where
    market_id in (select market_id from unique_market_ids)
  order by
    cost_per_view * (1 - (embedding <=> (select interest_embedding from user_embedding))) desc
  limit
    50
)
select
  tma.id,
  tma.market_id,
  tma.funds,
  tma.cost_per_view,
  contracts.data
from
  top_market_ads as tma
  inner join contracts on contracts.id = tma.market_id
where
  contracts.resolution_time is null
  and contracts.visibility = 'public'
  and (contracts.close_time > now() or contracts.close_time is null)
$$;

create
or replace function user_top_news (uid text, similarity numeric, n numeric) returns table (
  id numeric,
  created_time timestamp,
  title text,
  url text,
  published_time timestamp,
  author text,
  description text,
  image_url text,
  source_id text,
  source_name text,
  contract_ids text[]
) as $$
with 
user_embedding as (
  select interest_embedding
  from user_embeddings
  where user_id = uid
)
  SELECT
    id, created_time, title, url, published_time, author, description, image_url, source_id, source_name, contract_ids
  FROM
    news
  where
    1 - (title_embedding <=> (select interest_embedding from user_embedding)) > similarity
  ORDER BY published_time DESC
  LIMIT n;
$$ language sql;

create
or replace function save_user_topics (p_user_id text, p_topics text[]) returns void language sql as $$
with topic_embedding as (
    select avg(embedding) as average
    from topic_embeddings
    where topic = any(p_topics)
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
    topic_embedding as (
    select avg(embedding) as average
    from topic_embeddings where topic not in (
      select unnest(ARRAY['destiny.gg', 'stock', 'planecrash', 'proofnik', 'permanent', 'personal']::text[])
        )
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

create
or replace function get_reply_chain_comments_matching_contracts (contract_ids text[], past_time_ms bigint) returns table (id text, contract_id text, data JSONB) as $$
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
$$ language sql;

create
or replace function count_recent_comments_by_contract () returns table (contract_id text, comment_count integer) as $$
  SELECT
    contract_id,
    COUNT(*) AS comment_count
  FROM
    contract_comments
  WHERE
    created_time >= NOW() - INTERVAL '1 DAY'
  GROUP BY
    contract_id
  ORDER BY
    comment_count DESC;
$$ language sql;

create
or replace function extract_text_from_rich_text_json (description jsonb) returns text language sql immutable as $$
WITH RECURSIVE content_elements AS (
  SELECT jsonb_array_elements(description->'content') AS element
  WHERE jsonb_typeof(description) = 'object'
  UNION ALL
  SELECT jsonb_array_elements(element->'content')
  FROM content_elements
  WHERE element->>'type' = 'paragraph' AND element->'content' IS NOT NULL
),
               text_elements AS (
                 SELECT jsonb_array_elements(element->'content') AS text_element
                 FROM content_elements
                 WHERE element->>'type' = 'paragraph'
               ),
               filtered_text_elements AS (
                 SELECT text_element
                 FROM text_elements
                 WHERE jsonb_typeof(text_element) = 'object' AND text_element->>'type' = 'text'
               ),
               all_text_elements AS (
                 SELECT filtered_text_elements.text_element->>'text' AS text
                 FROM filtered_text_elements
               )
SELECT
  CASE
    WHEN jsonb_typeof(description) = 'string' THEN description::text
    ELSE COALESCE(string_agg(all_text_elements.text, ' '), '')
    END
FROM
  all_text_elements;
$$;

create
or replace function add_creator_name_to_description (data jsonb) returns text language sql immutable as $$
select * from CONCAT_WS(
        ' '::text,
        data->>'creatorName',
        extract_text_from_rich_text_json(data->'description')
  )
$$;

create
or replace function get_prefix_match_query (p_query text) returns text as $$
WITH words AS (
  SELECT unnest(regexp_split_to_array(trim(p_query), E'\\s+')) AS word
),
     numbered_words AS (
       SELECT word, row_number() OVER () AS rn, count(*) OVER () AS total
       FROM words
     )
SELECT string_agg(CASE
                    WHEN rn < total THEN word
                    ELSE word || ':*'
                    END, ' & ')
FROM numbered_words;
$$ language sql immutable;

create
or replace function get_exact_match_minus_last_word_query (p_query text) returns text as $$
WITH words AS (
  SELECT unnest(regexp_split_to_array(trim(p_query), E'\\s+')) AS word
),
     numbered_words AS (
       SELECT word, row_number() OVER () AS rn, count(*) OVER () AS total
       FROM words
     )
SELECT string_agg(word, ' & ')
FROM numbered_words
WHERE rn < total
$$ language sql immutable;

create
or replace function get_engaged_users () returns table (user_id text, username text, name text) as $$
  WITH recent_bettors AS (
      SELECT user_id, date_trunc('week', created_time) AS week
      FROM contract_bets
      WHERE created_time > NOW() - INTERVAL '3 weeks'
  ),
   recent_commentors AS (
       SELECT user_id, date_trunc('week', created_time) AS week
       FROM contract_comments
       WHERE created_time > NOW() - INTERVAL '3 weeks'
   ),
   recent_contractors AS (
       SELECT creator_id AS user_id, date_trunc('week', created_time) AS week
       FROM contracts
       WHERE created_time > NOW() - INTERVAL '3 weeks'
   ),
   weekly_activity_counts AS (
       SELECT user_id, week, COUNT(*) AS activity_count
       FROM (
                SELECT * FROM recent_bettors
                UNION ALL
                SELECT * FROM recent_commentors
                UNION ALL
                SELECT * FROM recent_contractors
            ) all_activities
       GROUP BY user_id, week
   )

  SELECT u.id, u.username, u.name
  FROM users u
  WHERE u.id IN (
      SELECT user_id
      FROM weekly_activity_counts
      GROUP BY user_id
      -- Must have at least 2 actions for at least 3 of the past 3 + current weeks
      HAVING COUNT(*) >= 3 AND MIN(activity_count) >= 2
  )
$$ language sql stable;

create
or replace function top_creators_for_user (uid text, excluded_ids text[], limit_n int) returns table (user_id text, n float) language sql stable parallel safe as $$
  select c.creator_id as user_id, count(*) as n
  from contract_bets as cb
  join contracts as c on c.id = cb.contract_id
  where cb.user_id = uid and not c.creator_id = any(excluded_ids)
  group by c.creator_id
  order by count(*) desc
  limit limit_n
$$;

create
or replace function get_notifications (uid text, unseen_only boolean, max_num integer) returns setof user_notifications language sql stable parallel SAFE as $$
select *
from user_notifications as n
where n.user_id = uid and (not unseen_only or not ((n.data->'isSeen')::boolean))
order by ((n.data->'createdTime')::bigint) desc
limit max_num
$$;

create
or replace function get_user_manalink_claims (creator_id text) returns table (manalink_id text, claimant_id text, ts bigint) as $$
    select mc.manalink_id, (tx.data)->>'toId' as claimant_id, ((tx.data)->'createdTime')::bigint as ts
    from manalink_claims as mc
    join manalinks as m on mc.manalink_id = m.id
    join txns as tx on mc.txn_id = tx.id
    where m.creator_id = creator_id
$$ language sql;
