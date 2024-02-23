
create table if not exists
    contracts (
                  id text not null primary key,
                  slug text,
                  question text,
                  creator_id text,
                  visibility text,
                  mechanism text,
                  outcome_type text,
                  created_time timestamptz,
                  close_time timestamptz,
                  resolution_time timestamptz,
                  resolution_probability numeric,
                  resolution text,
                  popularity_score numeric,
                  importance_score numeric,
                  freshness_score numeric default 0,
                  data jsonb not null,
                  question_fts tsvector generated always as (to_tsvector('english'::regconfig, question)) stored,
                  question_nostop_fts tsvector generated always as (
                         to_tsvector('english_nostop_with_prefix'::regconfig, question)
                         ) stored,
                  description_fts tsvector generated always as (
                         to_tsvector(
                                 'english'::regconfig,
                                 add_creator_name_to_description (data)
                         )
                         ) stored,
                  fs_updated_time timestamp not null,
                  deleted boolean default false,
                  group_slugs text[],
                  views int default 0,
                  last_updated_time timestamptz,
                  last_bet_time timestamptz,
                  last_comment_time timestamptz,
                  is_politics boolean default false
);

alter table contracts enable row level security;

drop policy if exists "public read" on contracts;

create policy "public read" on contracts for
    select
    using (true);

create index if not exists contracts_slug on contracts (slug);

create index if not exists contracts_creator_id on contracts (creator_id, created_time);

create index if not exists contracts_created_time on contracts (created_time desc);

create index if not exists contracts_unique_bettors on contracts (((data->>'uniqueBettorCount')::integer) desc);

create index if not exists contracts_close_time on contracts (close_time desc);

create index if not exists contracts_popularity_score on contracts (popularity_score desc);

create index if not exists contracts_visibility on contracts (visibility);

create index if not exists description_fts on contracts using gin (description_fts);

create index if not exists idx_contracts_close_time_resolution_time_visibility on contracts (close_time, resolution_time, visibility);

create index if not exists contracts_importance_score on contracts (importance_score desc);

create index if not exists contracts_freshness_score on contracts (freshness_score desc);

create index if not exists question_nostop_fts on contracts using gin (question_nostop_fts);

-- for calibration page
create index if not exists contracts_sample_filtering on contracts (
                                                                    outcome_type,
                                                                    resolution,
                                                                    visibility,
                                                                    ((data ->> 'uniqueBettorCount')::int)
    );

create index if not exists contracts_on_importance_score_and_resolution_time_idx on contracts(importance_score, resolution_time);

create index if not exists idx_lover_user_id1 on contracts ((data ->> 'loverUserId1')) where data->>'loverUserId1' is not null;
create index if not exists idx_lover_user_id2 on contracts ((data ->> 'loverUserId2')) where data->>'loverUserId2' is not null;

create index concurrently if not exists contracts_politics on contracts (is_politics);

alter table contracts
    cluster on contracts_creator_id;

create
    or replace function contract_populate_cols () returns trigger language plpgsql as $$
begin
    if new.data is not null then
        new.slug := (new.data) ->> 'slug';
        new.question := (new.data) ->> 'question';
        new.creator_id := (new.data) ->> 'creatorId';
        new.visibility := (new.data) ->> 'visibility';
        new.mechanism := (new.data) ->> 'mechanism';
        new.outcome_type := (new.data) ->> 'outcomeType';
        new.created_time := case
                                when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint)
                                else null
            end;
        new.close_time := case
                              when new.data ? 'closeTime' then millis_to_ts(((new.data) ->> 'closeTime')::bigint)
                              else null
            end;
        new.resolution_time := case
                                   when new.data ? 'resolutionTime'
                                       then millis_to_ts(((new.data) ->> 'resolutionTime')::bigint)
                                   else null
            end;
        new.resolution_probability := ((new.data) ->> 'resolutionProbability')::numeric;
        new.resolution := (new.data) ->> 'resolution';
        new.popularity_score := coalesce(((new.data) ->> 'popularityScore')::numeric, 0);
        new.deleted := coalesce(((new.data) ->> 'deleted')::boolean, false);
        new.group_slugs := case
                               when new.data ? 'groupSlugs' then jsonb_array_to_text_array((new.data) -> 'groupSlugs')
                               else null
            end;
        new.views := coalesce(((new.data) ->> 'views')::int, 0);
        new.last_updated_time := case
                                     when new.data ? 'lastUpdatedTime' then millis_to_ts(((new.data) ->> 'lastUpdatedTime')::bigint)
                                     else null
            end;
        new.last_bet_time := case
                                 when new.data ? 'lastBetTime' then millis_to_ts(((new.data) ->> 'lastBetTime')::bigint)
                                 else null
            end;
        new.last_comment_time := case
                                     when new.data ? 'lastCommentTime' then millis_to_ts(((new.data) ->> 'lastCommentTime')::bigint)
                                     else null
            end;
        new.is_politics := coalesce(((new.data) ->> 'isPolitics')::boolean, false);
    end if;
    return new;
end
$$;

create trigger contract_populate before insert
    or
    update on contracts for each row
execute function contract_populate_cols ();
