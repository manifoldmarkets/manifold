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
// actually scores against on a given tick. Overrides win, because the whole
// point is that a classification can land without a deploy — but every override
// carries its evidence and its author, so the merged map is still auditable.

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
