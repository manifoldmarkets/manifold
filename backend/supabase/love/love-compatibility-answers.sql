create table if not exists
  love_compatibility_answers (
    id bigint generated always as identity primary key,
    question_id bigint not null,
    creator_id text not null,
    created_time timestamptz not null default now(),
    explanation text null,
    multiple_choice integer,
    pref_choices integer[],
    importance integer
  );

alter table love_compatibility_answers
add constraint love_compatibility_answers_question_creator_unique unique (question_id, creator_id);

create index if not exists love_compatibility_answers_question_id_idx on love_compatibility_answers (question_id);

create index if not exists love_compatibility_answers_creator_id_created_time_idx on love_compatibility_answers (creator_id, created_time desc);

alter table love_compatibility_answers enable row level security;

drop policy if exists "public read" on love_compatibility_answers;

create policy "public read" on love_compatibility_answers using (true);

drop policy if exists "self update" on love_compatibility_answers;

create policy "self update" on love_compatibility_answers
for update
with
  check (creator_id = firebase_uid ());

drop policy if exists "self insert" on love_compatibility_answers;

create policy "self insert" on love_compatibility_answers for insert
with
  check (creator_id = firebase_uid ());

drop policy if exists "self delete" on love_compatibility_answers;

create policy "self delete" on love_compatibility_answers for delete using (creator_id = firebase_uid ());
