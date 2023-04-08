create index if not exists contracts_data_gin on contracts using GIN (data);
create index if not exists contracts_group_slugs_gin on contracts using GIN ((data->'groupSlugs'));
create index if not exists contracts_slug on contracts (slug);
create index if not exists contracts_creator_id on contracts (creator_id, created_time);
create index if not exists contracts_created_time on contracts (created_time desc);
create index if not exists contracts_close_time on contracts (close_time desc);
create index if not exists contracts_unique_bettors on contracts (((data->'uniqueBettors7Days')::int) desc);
create index if not exists contracts_popularity_score on contracts (((data->>'popularityScore')::real) desc);
create index if not exists contracts_daily_score on contracts (((data->>'dailyScore')::numeric) desc);
create index if not exists contracts_volume_24_hours on contracts (((data->>'volume24Hours')::numeric) desc);
create index if not exists contracts_elasticity on contracts (((data->>'elasticity')::numeric) desc);
create index if not exists contracts_last_updated_time on contracts (((data->>'lastUpdatedTime')::numeric) desc);
create index if not exists contracts_unique_bettor_count on contracts (((data->>'uniqueBettorCount')::numeric) desc);
create index if not exists contracts_resolution_time on contracts (resolution_time desc);
create index if not exists contracts_visibility_public ON contracts (id)
where visibility = 'public';