begin;

-- Open-weight classifications for the OpenRouter token-share index.
--
-- The audited seed stays in common/src/perps/open-weight-models.ts — that file
-- is the published methodology and must remain readable as one artifact. This
-- table layers on top of it, for two reasons:
--
--  1. A new model entering OpenRouter's top 50 froze the feed until someone
--     shipped a one-line map entry: PR, merge, image build, VM redeploy. Hours,
--     for a boolean. Three times in the week to 2026-08-13 (muse-spark,
--     nemotron-3.5-lightning, solar-pro4).
--  2. `first_seen` gives the grace window a clock. The publication gate lets a
--     small unknown through while it is fresh and halts once it goes stale, so
--     the row has to exist before anyone classifies it.
--
-- `open is null` means PENDING: seen in the catalog, not yet adjudicated.
-- Pending rows are excluded from both sides of the index, exactly as an absent
-- entry is — they record that we know about the model, not what it is.
create table if not exists model_classifications (
  permaslug text primary key,
  -- null = pending. Deliberately nullable rather than defaulted: defaulting a
  -- frontier launch to either side would move an executable index on a guess.
  open boolean,
  -- Public weights repo backing an `open` verdict; the evidence, not a label.
  weights text,
  -- 'auto'  — HuggingFace verification by the nightly catalog watcher
  -- 'admin' — a human decision through the admin tool
  source text not null check (source in ('auto', 'admin')),
  -- What was checked and what came back, so an `open` call can be re-audited
  -- without re-deriving it: hugging_face_id, repo visibility, weight files.
  evidence jsonb not null default '{}'::jsonb,
  -- When the catalog watcher first saw the model. Orders the review queue.
  first_seen timestamptz not null default now(),
  -- When the model first appeared in the ranked window while still unclassified
  -- — i.e. when it started actually affecting the index. The grace deadline
  -- runs from HERE, not from first_seen.
  --
  -- The distinction matters: the catalog carries hundreds of models that never
  -- rank, and most sit unclassified indefinitely because nobody needs to
  -- adjudicate a model with no tokens. If the deadline ran from first_seen,
  -- every one of those would silently become a landmine that halts the feed the
  -- instant it cracked the top 50, with its grace already long expired. Dating
  -- from first rank instead gives every model the same window measured from the
  -- moment it starts to matter.
  first_ranked_at timestamptz,
  classified_at timestamptz,
  classified_by text,
  updated_time timestamptz not null default now(),

  -- Mirrors the invariant the seed file's own test enforces: every open model
  -- cites weights, no closed model pretends to.
  constraint model_classifications_open_cites_weights check (
    (open is true and weights is not null) or
    (open is not true and weights is null)
  ),
  -- A verdict always records when it was reached; pending never does.
  constraint model_classifications_verdict_timestamped check (
    (open is null) = (classified_at is null)
  )
);

comment on table model_classifications is
  'Operator/auto overrides layered over the audited seed in common/src/perps/open-weight-models.ts; open is null means pending adjudication';

-- The publication gate reads pending rows on every tick to decide whose grace
-- window has expired, and the admin tool lists them oldest-first.
create index if not exists model_classifications_pending_idx
  on model_classifications (first_seen)
  where open is null;

-- RLS on, with NO policy: deny-all for anon and authenticated.
--
-- Not hygiene — this table is a lever on an executable index.
-- resolveModelClassifications merges these rows into the classification map the
-- oracle scores against, so a row anyone can write is a row that can move a
-- market that settles real money. A table in the public schema is reachable
-- through PostgREST, and with RLS disabled the only thing standing between the
-- anon key and this table is whatever grants happen to be in place.
--
-- Deny-all is the correct policy rather than the cautious one, because nothing
-- legitimate reads this from a client. Both surfaces that touch it — the
-- `get-model-classifications` and `set-model-classification` endpoints — are
-- admin-gated and run on createSupabaseDirectClient(), a direct connection that
-- bypasses RLS entirely. The admin page reaches them through useAPIGetter, never
-- through Supabase. So there is no client read to preserve, and adding a public
-- read policy (as oracle_prices does, for data that IS rendered client-side)
-- would grant reach nothing needs.
--
-- Every one of the 119 tables in prod's public schema has RLS enabled. Without
-- this line, model_classifications would be the only exception.
alter table model_classifications enable row level security;

commit;
