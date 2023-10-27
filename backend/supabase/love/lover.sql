create table if not exists
  lovers (
    id bigint generated always as identity primary key,
    user_id text not null,
    created_time timestamptz not null default now(),
    last_online_time timestamptz not null default now(),
    -- required
    birthdate timestamp not null,
    gender text not null, -- male, female, trans-male
    pref_gender text[] not null, -- male, trans-female
    pref_age_min int not null default 18,
    pref_age_max int not null default 100,
    pref_relation_styles text[] not null, -- mono, poly, open, etc
    wants_kids_strength int not null default 0, -- 0 is doesn't want any kids
    looking_for_matches boolean not null default true,
    visibility text not null default 'public', -- public, unlisted
    messaging_status text not null default 'open', -- open, closed, out-only
    comments_enabled boolean not null default true,
    city text not null,
    -- optional
    bio text,
    website text,
    twitter text,
    has_kids int,
    is_smoker boolean,
    drinks_per_month int,
    is_vegetarian_or_vegan boolean,
    political_beliefs text[],
    religious_belief_strength int, -- 0 is none
    religious_beliefs text,
    photo_urls text[],
    pinned_url text,
    ethnicity text[],
    born_in_location text,
    height_in_inches int,
    education_level text,
    university text,
    occupation text,
    occupation_title text,
    company text,
    region_code text,
    country text,
    city_latitude decimal(9, 6),
    city_longitude decimal(9, 6)
  );

alter table lovers enable row level security;

drop policy if exists "public read" on lovers;

create policy "public read" on lovers using (true);

drop policy if exists "self update" on lovers;

create policy "self update" on lovers
for update
with
  check (user_id = firebase_uid ());

create index if not exists lovers_user_id_idx on lovers (user_id);
