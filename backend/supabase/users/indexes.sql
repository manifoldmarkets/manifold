create index if not exists users_data_gin on users using GIN (data);

/* indexes supporting @-mention autocomplete */
create index if not exists users_name_gin on users using GIN ((data ->> 'name') gin_trgm_ops);

create index if not exists users_username_gin on users using GIN ((data ->> 'username') gin_trgm_ops);

create index users_name_username_vector_idx on users using gin (name_username_vector);

create index if not exists users_follower_count_cached on users ((to_jsonb(data -> 'followerCountCached')) desc);

create index if not exists user_referrals_idx on users ((data ->> 'referredByUserId'))
where
  data ->> 'referredByUserId' is not null;

create index if not exists user_profit_cached_all_time_idx on users (((data -> 'profitCached' ->> 'allTime')::numeric));

create index user_username_idx on users using btree (username);
