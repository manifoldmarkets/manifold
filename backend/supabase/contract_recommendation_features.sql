
create table if not exists
    contract_recommendation_features (
                                         contract_id text not null primary key,
                                         f0 real not null,
                                         f1 real not null,
                                         f2 real not null,
                                         f3 real not null,
                                         f4 real not null,
                                         freshness_score real not null default 1
);

alter table contract_recommendation_features enable row level security;

drop policy if exists "public read" on contract_recommendation_features;

create policy "public read" on contract_recommendation_features for
    select
    using (true);

drop policy if exists "admin write access" on contract_recommendation_features;

create policy "admin write access" on contract_recommendation_features as PERMISSIVE for all to service_role;

create index if not exists contract_recommendation_features_freshness_score on contract_recommendation_features (freshness_score desc);
