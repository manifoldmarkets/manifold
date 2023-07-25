create index if not exists users_name_idx on users (name);

create index if not exists user_username_idx on users (username);

create index users_name_username_vector_idx on users using gin (name_username_vector);

create index if not exists users_follower_count_cached on users ((to_jsonb(data -> 'followerCountCached')) desc);

create index if not exists user_referrals_idx on users ((data ->> 'referredByUserId'))
where
  data ->> 'referredByUserId' is not null;

create index if not exists users_betting_streak_idx on users (((data -> 'currentBettingStreak')::int));
