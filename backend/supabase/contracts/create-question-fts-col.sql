alter table public.contracts
add column question_fts tsvector generated always as (
        to_tsvector('english', description || ' ' || title)
    ) stored;
create index if not exists question_fts on contracts using gin (question_fts);
-- generate the index