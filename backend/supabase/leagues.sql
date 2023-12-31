
create table if not exists
    leagues (
                user_id text not null,
                season int not null, -- integer id of season, i.e. 1 for first season, 2 for second, etc.
                division int not null, -- 1 (beginner) to 4 (expert)
                cohort text not null, -- id of cohort (group of competing users). Unique across seasons.
                mana_earned numeric not null default 0.0,
                mana_earned_breakdown jsonb not null default '{}'::jsonb, -- Key is category, value is total mana earned in that category
                rank_snapshot int,
                created_time timestamp not null default now(),
                unique (user_id, season)
);

alter table leagues enable row level security;

drop policy if exists "public read" on leagues;

create policy "public read" on leagues for
    select
    using (true);
