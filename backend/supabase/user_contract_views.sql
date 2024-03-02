create table if not exists user_contract_views (
    -- note that postgres doesn't allow nulls in primary keys so we have this synthetic key
    id bigint generated always as identity primary key,
    user_id text null, -- null means logged out view
    contract_id text not null,
    promoted_views bigint not null default 0 check (promoted_views >= 0),
    card_views bigint not null default 0 check (card_views >= 0),
    page_views bigint not null default 0 check (page_views >= 0),
    last_promoted_view_ts timestamptz null,
    last_card_view_ts timestamptz null,
    last_page_view_ts timestamptz null,
    check (promoted_views + card_views + page_views > 0)
    check (last_page_view_ts is not null or
           last_card_view_ts is not null or
           last_promoted_view_ts is not null)
);

alter table user_contract_views enable row level security;

create policy "self and admin read" on user_contract_views for select
    using (user_id = firebase_uid() or is_admin(firebase_uid()));

create unique index if not exists user_contract_views_user_id on user_contract_views (user_id, contract_id) nulls not distinct;

create index if not exists user_contract_views_contract_id on user_contract_views (contract_id, user_id);

-- insert into user_contract_views (user_id, contract_id, last_promoted_view_ts, promoted_views, last_card_view_ts, card_views, last_page_view_ts, page_views)
--     select
--          usm.user_id,
--          usm.contract_id,
--          max(case when usm.is_promoted then usm.created_time else null end) as last_promoted_view_ts,
--          sum(case when usm.is_promoted then 1 else 0 end) as promoted_views,
--          max(case when usm.type = 'view market card' and (usm.is_promoted is null or not usm.is_promoted) then usm.created_time else null end) as last_card_view_ts,
--          sum(case when usm.type = 'view market card' and (usm.is_promoted is null or not usm.is_promoted) then 1 else 0 end) as card_views,
--          max(case when usm.type = 'view market' and (usm.is_promoted is null or not usm.is_promoted) then usm.created_time else null end) as last_page_view_ts,
--          sum(case when usm.type = 'view market' and (usm.is_promoted is null or not usm.is_promoted) then 1 else 0 end) as page_views
--      from user_seen_markets as usm
--      group by usm.contract_id, usm.user_id
--      union all
--      select
--          null as user_id,
--          ue.contract_id,
--          max(case when (ue.data->'isPromoted')::boolean then ue.ts else null end) as last_promoted_view_ts,
--          sum(case when (ue.data->'isPromoted')::boolean then 1 else 0 end) as promoted_views,
--          max(case when ue.name = 'view market card' and ((ue.data->'isPromoted') is null or not (ue.data->'isPromoted')::boolean) then ue.ts else null end) as last_card_view_ts,
--          sum(case when ue.name = 'view market card' and ((ue.data->'isPromoted') is null or not (ue.data->'isPromoted')::boolean) then 1 else 0 end) as card_views,
--          max(case when ue.name = 'view market' and ((ue.data->'isPromoted') is null or not (ue.data->'isPromoted')::boolean) then ue.ts else null end) as last_page_view_ts,
--          sum(case when ue.name = 'view market' and ((ue.data->'isPromoted') is null or not (ue.data->'isPromoted')::boolean) then 1 else 0 end) as page_views
--      from user_events as ue
--      where ue.contract_id is not null
--      and (ue.name = 'view market' or ue.name = 'view market card' )
--      group by ue.contract_id
