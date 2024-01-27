create table if not exists user_contract_views (
    -- note that postgres doesn't allow nulls in primary keys so we have this synthetic key
    id bigint generated always as identity primary key,
    user_id text null, -- null means logged out view
    contract_id text not null,
    last_view_ts timestamptz not null default now(),
    promoted_views bigint not null default 0 check (promoted_views >= 0),
    card_views bigint not null default 0 check (card_views >= 0),
    page_views bigint not null default 0 check (page_views >= 0),
    check (promoted_views + card_views + page_views > 0)
);

alter table user_contract_views enable row level security;

create policy "self and admin read" on user_contract_views for select
    using (user_id = firebase_uid() or is_admin(firebase_uid()));

create unique index if not exists user_contract_views_user_id on user_contract_views (user_id, contract_id) nulls not distinct;

create index if not exists user_contract_views_contract_id on user_contract_views (contract_id, user_id);

-- insert into user_contract_views (user_id, contract_id, last_view_ts, promoted_views, card_views, page_views)
--     select
--         usm.user_id,
--         usm.contract_id,
--         max(usm.created_time) as last_view_ts,
--         sum(case when usm.is_promoted then 1 else 0 end) as promoted_views,
--         sum(case when usm.type = 'view market card' and (usm.is_promoted is null or not usm.is_promoted) then 1 else 0 end) as card_views,
--         sum(case when usm.type = 'view market' and (usm.is_promoted is null or not usm.is_promoted) then 1 else 0 end) as page_views
--     from user_seen_markets as usm
--     group by usm.contract_id, usm.user_id
-- on conflict (user_id, contract_id) do update set
--     last_view_ts = greatest(user_contract_views.last_view_ts, excluded.last_view_ts),
--     promoted_views = user_contract_views.promoted_views + excluded.promoted_views,
--     card_views = user_contract_views.card_views + excluded.card_views,
--     page_views = user_contract_views.page_views + excluded.page_views;
