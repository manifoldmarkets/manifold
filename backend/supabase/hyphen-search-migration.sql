-- Create a function to normalize hyphens for search
create
or replace function normalize_hyphens (input_text text) returns text immutable strict language sql as $$
  SELECT regexp_replace(input_text, '[-−–—]', '', 'g');
$$;

-- Create a custom text search configuration that handles hyphens
create text search configuration public.english_hyphen_normalized (
  copy = english_extended
);

-- Replace existing FTS columns with normalized versions
-- This approach uses the same column names to avoid breaking existing code
-- Drop existing generated columns and recreate with normalization
alter table contracts
drop column if exists question_fts cascade;

alter table contracts
add column question_fts tsvector generated always as (
  to_tsvector(
    'english_extended'::regconfig,
    normalize_hyphens (question)
  )
) stored;

-- Recreate the question_fts index
create index question_fts on public.contracts using gin (question_fts);

-- Similarly for descriptions - replace the existing column
alter table contracts
drop column if exists description_fts cascade;

alter table contracts
add column description_fts tsvector generated always as (
  to_tsvector(
    'english_extended'::regconfig,
    normalize_hyphens (add_creator_name_to_description (data))
  )
) stored;

-- Recreate the description_fts index
create index description_fts on public.contracts using gin (description_fts);

-- Also update question_nostop_fts for the 'with-stopwords' search type
alter table contracts
drop column if exists question_nostop_fts cascade;

alter table contracts
add column question_nostop_fts tsvector generated always as (
  to_tsvector(
    'english_nostop_with_prefix'::regconfig,
    normalize_hyphens (question)
  )
) stored;

-- Recreate the question_nostop_fts index
create index question_nostop_fts on public.contracts using gin (question_nostop_fts);
