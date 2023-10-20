

create table if not exists
    lovers (
      id bigint generated always as identity primary key,
      user_id text not null,
      created_time timestamptz not null default now(),
      last_online_time timestamptz not null default now(),

      -- required
      birthdate timestamp not null,
      city text not null,
      gender text not null, -- male, female, trans-male
      pref_gender text[] not null, -- male, trans-female
      pref_age_min int not null default 18,
      pref_age_max int not null default 100,
      pref_relation_styles text[] not null, -- mono, poly, open, etc
      is_smoker boolean not null default false,
      drinks_per_month int not null default 0,
      is_vegetarian_or_vegan boolean not null default false,
      has_kids int not null default 0,
      wants_kids_strength int not null default 0, -- 0 is doesn't want any kids
      looking_for_matches boolean not null default true,
      visibility text not null default 'public', -- public, unlisted
      messaging_status text not null default 'open', -- open, closed, out-only

      -- optional
      political_beliefs text[],
      religious_belief_strength int, -- 0 is none
      religious_beliefs text[],
      photo_urls text[],
      pinned_url text,
      ethnicity text[],
      born_in_location text,
      height_in_inches int,
      has_pets boolean,
      education_level text
);

alter table lovers enable row level security;

drop policy if exists "public read" on lovers;
create policy  "public read" on lovers using (true);

create index if not exists lovers_user_id_idx on lovers(user_id);
