begin;

-- Runtime classifications for the OpenRouter Chinese-lab token-share index.
--
-- The audited constants in common/src/perps/lab-share.ts remain the published
-- seed and always win. This table is the no-deploy maintenance layer for new
-- OpenRouter authors and for the occasional model-specific exception (for
-- example, an anonymous preview model that is attributed after its reveal).
--
-- `is_chinese is null` means PENDING. Pending subjects remain unknown to the
-- index; the row merely makes them visible to the operator queue and records
-- when they first appeared.
create table if not exists
  openrouter_lab_classifications (
    subject_type text not null check (subject_type in ('author', 'model')),
    subject_slug text not null,
    -- null = pending. Never guess a side for an executable index.
    is_chinese boolean,
    -- 'auto' is discovery/research; 'admin' is a human verdict.
    source text not null check (source in ('auto', 'admin')),
    -- Discovery context, citations/research, and append-only verdict history.
    evidence jsonb not null default '{}'::jsonb,
    first_seen timestamptz not null default now(),
    first_ranked_at timestamptz,
    classified_at timestamptz,
    classified_by text,
    updated_time timestamptz not null default now(),
    primary key (subject_type, subject_slug),
    constraint openrouter_lab_classifications_nonempty_slug check (
      length(subject_slug) > 0
      and subject_slug = btrim(subject_slug)
    ),
    -- A verdict always records when it was reached; pending never does.
    constraint openrouter_lab_classifications_verdict_timestamped check ((is_chinese is null) = (classified_at is null)),
    -- Human decisions are attributable; pending rows have no classifier.
    -- A future automatic verdict may use source='auto' without pretending a
    -- person made it, but discovery alone never fills is_chinese.
    constraint openrouter_lab_classifications_verdict_attributed check (
      (
        is_chinese is null
        and classified_by is null
      )
      or (
        is_chinese is not null
        and (
          source = 'auto'
          or classified_by is not null
        )
      )
    )
  );

comment on table openrouter_lab_classifications is 'Seed-external author/model classifications for the OpenRouter Chinese-lab index; is_chinese null means pending review';

-- Ranked work is urgent, then catalog-only backlog. The primary key already
-- serves point lookups; this partial index serves the review queue.
create index if not exists openrouter_lab_classifications_pending_idx on openrouter_lab_classifications (first_ranked_at asc nulls last, first_seen asc)
where
  is_chinese is null;

-- No browser client needs direct access. API and scheduler paths use the
-- direct server connection, so deny anon/authenticated access by enabling RLS
-- without adding a policy. A classification is a lever on a money market.
alter table openrouter_lab_classifications enable row level security;

commit;
