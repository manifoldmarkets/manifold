
create table if not exists
    user_recommendation_features (
                                     user_id text not null primary key,
                                     f0 real not null,
                                     f1 real not null,
                                     f2 real not null,
                                     f3 real not null,
                                     f4 real not null
);

alter table user_recommendation_features enable row level security;

drop policy if exists "public read" on user_recommendation_features;

create policy "public read" on user_recommendation_features for
    select
    using (true);

drop policy if exists "admin write access" on user_recommendation_features;

create policy "admin write access" on user_recommendation_features as PERMISSIVE for all to service_role;
