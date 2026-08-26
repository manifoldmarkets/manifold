import {
  ModelClassifications,
  OPEN_WEIGHT_MODELS,
  UNCLASSIFIED_GRACE_WINDOW_MS,
  basePermaslug,
} from 'common/perps/open-weight-models'
import { SupabaseDirectClient } from 'shared/supabase/init'

// Resolution layer between the audited seed list and the operator/auto
// overrides in `model_classifications`.
//
// The seed file stays the published methodology; this decides what the oracle
// actually scores against on a given tick. Overrides win on models the seed
// does NOT classify, because the whole point is that a classification can land
// without a deploy — but every override carries its evidence and its author, so
// the merged map is still auditable. Where the seed does classify a model the
// seed wins, on read as well as on write: reclassifying an audited entry is a
// change to the published methodology, not an admin-form decision.

export type ClassificationRow = {
  permaslug: string
  open: boolean | null
  weights: string | null
  source: 'auto' | 'admin'
  evidence: Record<string, unknown>
  first_seen: string
  first_ranked_at: string | null
  classified_at: string | null
  classified_by: string | null
}

export type ResolvedClassifications = {
  /** Seed + adjudicated overrides, ready for computeOpenWeightShare. */
  classifications: ModelClassifications
  /**
   * Pending models whose grace window has run out. The publication gate halts
   * on these however small they are.
   */
  expiredUnclassified: string[]
  /** Pending models still inside their window — published under grace. */
  pendingUnclassified: string[]
}

/**
 * Build the classification map the index scores against.
 *
 * Pending rows (`open is null`) are deliberately NOT merged in: an unadjudicated
 * model must keep reading as unclassified so it stays out of both sides of the
 * index. Their only job here is to supply the grace-window clock.
 */
export const resolveModelClassifications = async (
  pg: SupabaseDirectClient,
  now = Date.now(),
  graceWindowMs = UNCLASSIFIED_GRACE_WINDOW_MS
): Promise<ResolvedClassifications> => {
  const rows = await pg.manyOrNone<ClassificationRow>(
    `select permaslug, open, weights, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by
     from model_classifications`
  )

  const classifications: ModelClassifications = { ...OPEN_WEIGHT_MODELS }
  const expiredUnclassified: string[] = []
  const pendingUnclassified: string[] = []

  for (const row of rows) {
    const slug = basePermaslug(row.permaslug)
    if (row.open === null) {
      // A pending row for a model the seed already classifies is inert — the
      // seed verdict stands and there is nothing to wait for.
      if (OPEN_WEIGHT_MODELS[slug]) continue
      // Never ranked -> no deadline. It is not affecting the index, so there
      // is nothing to expire; the clock starts the first time it does.
      if (!row.first_ranked_at) {
        pendingUnclassified.push(slug)
        continue
      }
      const age = now - new Date(row.first_ranked_at).getTime()
      if (age > graceWindowMs) expiredUnclassified.push(slug)
      else pendingUnclassified.push(slug)
      continue
    }
    // The seed list is the published methodology, so an override of a seeded
    // model would change what the index means without going through the file
    // where the reasoning is recorded. `setModelClassification` refuses to
    // write one; this enforces the same invariant on read, which also covers
    // the rows `upsertClassification` wrote automatically before the seed
    // caught up.
    //
    // NB: `OPEN_WEIGHT_LIST_VERSION` is NOT stored with the points. It goes
    // into the insert log line only — `oracle_prices` is
    // (feed_id, ts, price, source_ts, published_at). So there is no per-point
    // record of which list version priced it, and a published point cannot be
    // attributed to a version after the fact. Do not reason as if there were
    // one; it matters most when deciding whether a corrected classification
    // should cause historical points to be recomputed.
    if (OPEN_WEIGHT_MODELS[slug]) continue
    classifications[slug] = row.open
      ? { open: true, weights: row.weights ?? undefined }
      : { open: false }
  }

  return {
    classifications,
    expiredUnclassified: expiredUnclassified.sort(),
    pendingUnclassified: pendingUnclassified.sort(),
  }
}

export type PendingModelSeed = {
  permaslug: string
  name?: string
  huggingFaceId?: string | null
  /** Which surface turned it up — the catalog sweep, or a live rankings tick. */
  discoveredVia?: 'catalog' | 'rankings'
}

/**
 * Start the grace clock for models we have just discovered.
 *
 * `first_seen` must never move once set: it is the deadline the publication
 * gate enforces, so re-inserting on every tick would keep an unadjudicated
 * model permanently inside its window. Hence DO NOTHING on conflict rather
 * than a touch-on-write upsert.
 */
export const recordPendingModels = async (
  pg: SupabaseDirectClient,
  models: PendingModelSeed[],
  firstSeen?: number
) => {
  const seen = new Set<string>()
  const rows: { slug: string; evidence: string }[] = []
  for (const model of models) {
    const slug = basePermaslug(model.permaslug)
    if (OPEN_WEIGHT_MODELS[slug] || seen.has(slug)) continue
    seen.add(slug)
    rows.push({
      slug,
      // Carried so the admin queue can show what the model is and where its
      // weights would live, instead of a bare permaslug to go and google.
      evidence: JSON.stringify({
        openRouterName: model.name ?? null,
        huggingFaceId: model.huggingFaceId ?? null,
        discoveredVia: model.discoveredVia ?? 'catalog',
      }),
    })
  }
  if (rows.length === 0) return 0

  await pg.none(
    `insert into model_classifications (permaslug, open, source, evidence, first_seen)
     select slug, null::boolean, 'auto', evidence::jsonb, $2::timestamptz
     from unnest($1::text[], $3::text[]) as t(slug, evidence)
     on conflict (permaslug) do nothing`,
    [
      rows.map((r) => r.slug),
      firstSeen
        ? new Date(firstSeen).toISOString()
        : new Date().toISOString(),
      rows.map((r) => r.evidence),
    ]
  )
  return rows.length
}

/**
 * Note that these models are in the ranked window and still unclassified,
 * starting the grace clock the first time each one appears.
 *
 * Creates the pending row if the catalog sweep never saw the model — the
 * rankings dataset carries models that `/models` does not list, and those are
 * precisely the ones that would otherwise halt the index with no row for
 * anyone to review.
 *
 * `first_ranked_at` is only ever set once (`coalesce` on the existing value):
 * it is a deadline, and a deadline that resets every hour is not a deadline.
 */
export const recordUnclassifiedInRankings = async (
  pg: SupabaseDirectClient,
  permaslugs: string[],
  rankedAt = Date.now()
) => {
  const slugs = Array.from(
    new Set(permaslugs.map(basePermaslug))
  ).filter((slug) => !OPEN_WEIGHT_MODELS[slug])
  if (slugs.length === 0) return 0

  await pg.none(
    `insert into model_classifications
       (permaslug, open, source, evidence, first_seen, first_ranked_at)
     select unnest($1::text[]), null::boolean, 'auto',
            jsonb_build_object('discoveredVia', 'rankings'),
            $2::timestamptz, $2::timestamptz
     on conflict (permaslug) do update set
       first_ranked_at = coalesce(
         model_classifications.first_ranked_at, $2::timestamptz
       ),
       updated_time = now()
     where model_classifications.open is null`,
    [slugs, new Date(rankedAt).toISOString()]
  )
  return slugs.length
}

/**
 * Record a verdict. `open: true` requires the weights repo that proves it —
 * the table's check constraint enforces the same invariant the seed file's
 * test does, so a mistake here fails loudly rather than publishing an
 * unevidenced claim.
 */
export const upsertClassification = async (
  pg: SupabaseDirectClient,
  params: {
    permaslug: string
    open: boolean
    weights?: string | null
    source: 'auto' | 'admin'
    evidence?: Record<string, unknown>
    classifiedBy?: string | null
  }
) => {
  const { permaslug, open, source, classifiedBy } = params
  const weights = open ? params.weights ?? null : null
  if (open && !weights)
    throw new Error(
      `refusing to classify ${permaslug} open without a weights repo`
    )

  await pg.none(
    `insert into model_classifications
       (permaslug, open, weights, source, evidence, classified_at, classified_by, updated_time)
     values ($1, $2, $3, $4, $5::jsonb, now(), $6, now())
     on conflict (permaslug) do update set
       open = excluded.open,
       weights = excluded.weights,
       source = excluded.source,
       evidence = excluded.evidence,
       classified_at = excluded.classified_at,
       classified_by = excluded.classified_by,
       updated_time = now()`,
    [
      basePermaslug(permaslug),
      open,
      weights,
      source,
      JSON.stringify(params.evidence ?? {}),
      classifiedBy ?? null,
    ]
  )
}

/**
 * Attach the research agent's findings to a PENDING row without adjudicating
 * it.
 *
 * The row stays `open is null`, so the model remains excluded from both sides
 * of the index exactly as before — nothing about the published number changes.
 * What changes is the review queue: instead of a bare permaslug to go and
 * google, the operator sees a recommendation and the searches behind it, and
 * confirms with one click.
 *
 * Only ever touches unadjudicated rows: the `where` clause means a human
 * verdict can never be overwritten by a later agent run.
 */
export const recordAgentRecommendation = async (
  pg: SupabaseDirectClient,
  permaslug: string,
  /**
   * What the agent concluded — including `open`, which is a recommendation
   * like any other rather than a classification. The row stays pending either
   * way; only a human moves it off `null`.
   */
  recommendation: 'open' | 'closed' | null,
  evidence: Record<string, unknown>,
  /**
   * Whether this run counts as "researched" for cooldown purposes. False for
   * transient failures: the evidence is still attached so the queue shows what
   * happened, but the clock does not start, so the next sweep retries. See
   * AGENT_RESEARCH_COOLDOWN_MS for why burning a retry here is a live outage.
   */
  startCooldown = true
) => {
  await pg.none(
    `update model_classifications
     set evidence = evidence || $2::jsonb, updated_time = now()
     where permaslug = $1 and open is null`,
    [
      basePermaslug(permaslug),
      JSON.stringify({
        ...evidence,
        agentRecommendation: recommendation,
        ...(startCooldown ? { agentRanAt: new Date().toISOString() } : {}),
      }),
    ]
  )
}

/** Pending rows for the admin tool, oldest first — the review queue. */
export const getPendingClassifications = async (
  pg: SupabaseDirectClient
): Promise<ClassificationRow[]> =>
  pg.manyOrNone<ClassificationRow>(
    `select permaslug, open, weights, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by
     from model_classifications
     where open is null
     order by first_ranked_at asc nulls last, first_seen asc`
  )

/**
 * How long a researched-but-unsettled model is left alone before a re-run.
 *
 * DERIVED from the grace window rather than chosen independently, because the
 * two are not independent quantities and drifting them apart is a live outage.
 *
 * Only ranked models are researched at all, so every model under cooldown has
 * a grace clock already running. A cooldown longer than that window means a
 * model researched once is never retried before its grace expires and the feed
 * halts. That is not a theoretical ordering: a transient failure — Anthropic
 * unreachable, a missing key, a run that burns its turns — comes back as
 * `unresolved`, and a flat seven-day cooldown against a two-day window turned
 * one bad API call into a guaranteed halt two days later, with seven sweeps
 * sitting idle in between that could each have fixed it.
 *
 * A quarter of the window gives roughly four attempts before the deadline,
 * which is enough to ride out a transient outage, while still cutting the
 * four-sweeps-a-day re-ask that motivated a cooldown in the first place. The
 * cost that buys is negligible: the ranked population is a handful of models,
 * so four retries is cents. Expressed as a fraction so that changing the grace
 * window moves this with it and the invariant cannot silently break.
 */
export const AGENT_RESEARCH_COOLDOWN_MS = UNCLASSIFIED_GRACE_WINDOW_MS / 4

export type ResearchEligibility = {
  /** Base slugs that have entered the ranked window at least once. */
  everRanked: string[]
  /** Base slugs researched recently enough to skip this sweep. */
  recentlyResearched: string[]
}

/**
 * Who is worth spending a research call on right now.
 *
 * Two independent filters, and between them they are the whole cost story.
 *
 * RANKED. The index is defined over OpenRouter's top 50, so a model that has
 * never ranked cannot move it. The catalog carries ~130 unclassified models
 * with no declared repo and most will never rank, so researching all of them
 * is spend with no reachable effect on the published number. `first_ranked_at`
 * already records exactly the models that started mattering, and the grace
 * window already covers the gap between ranking and adjudication — so research
 * follows ranking rather than trying to pre-empt it.
 *
 * COOLDOWN. A `closed` recommendation and an `unresolved` both leave the row
 * `open is null` on purpose (only a human may conclude closed). Without a
 * cooldown those rows re-enter the candidate set on the very next sweep and
 * are researched again, unchanged, four times a day, forever — the answer does
 * not improve on re-asking, because nothing about the model changed. A week is
 * long enough that a re-run is only paid when a publisher plausibly shipped
 * weights in the interim, which is the one thing that would change the verdict.
 */
export const getResearchEligibility = async (
  pg: SupabaseDirectClient,
  now = Date.now(),
  cooldownMs = AGENT_RESEARCH_COOLDOWN_MS
): Promise<ResearchEligibility> => {
  const rows = await pg.manyOrNone<{
    permaslug: string
    first_ranked_at: string | null
    agent_ran_at: string | null
  }>(
    `select permaslug, first_ranked_at, evidence->>'agentRanAt' as agent_ran_at
     from model_classifications
     where open is null`
  )

  const everRanked: string[] = []
  const recentlyResearched: string[] = []
  for (const row of rows) {
    const slug = basePermaslug(row.permaslug)
    if (row.first_ranked_at) everRanked.push(slug)
    const ranAt = row.agent_ran_at ? Date.parse(row.agent_ran_at) : NaN
    // A malformed timestamp reads as "never researched" rather than blocking
    // the model forever — it costs one extra call, not a permanent hole.
    if (Number.isFinite(ranAt) && now - ranAt < cooldownMs)
      recentlyResearched.push(slug)
  }
  return { everRanked, recentlyResearched }
}
