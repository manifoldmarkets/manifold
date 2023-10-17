create table if not exists
    love_questions (
       id bigint generated always as identity primary key,
       creator_id text not null,
       created_time timestamptz not null default now(),
       question text not null,
       importance_score numeric not null default 0,
       answer_type text not null default 'free_response', -- free_response, multiple_choice, integer
       multiple_choice_options jsonb -- {0: "strongly disagree", 1: "disagree"}
    );

alter table love_questions add column multiple_choice_options jsonb;
create index if not exists love_questions_creator_id_idx on love_questions (creator_id);
create index if not exists love_questions_importance_score on love_questions (importance_score desc);
create index if not exists love_questions_created_time on love_questions (created_time desc);

alter table love_questions enable row level security;

drop policy if exists "public read" on love_questions;
create policy  "public read" on love_questions using (true);