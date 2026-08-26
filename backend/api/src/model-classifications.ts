import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_MODELS,
  UNCLASSIFIED_GRACE_WINDOW_MS,
  basePermaslug,
} from 'common/perps/open-weight-models'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import {
  ClassificationRow,
  upsertClassification,
} from 'shared/perps/model-classifications'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

// Operator tooling for the open-weight index's classification queue.
//
// Classifications used to be a code change: PR, merge, image build, VM
// redeploy, hours — for one boolean, while the perp marked and funded against
// a halted oracle. These endpoints write the override table the scheduler
// re-reads every tick, so a verdict takes effect on the next run.

export const getModelClassifications: APIHandler<
  'get-model-classifications'
> = async (_, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone<ClassificationRow>(
    `select permaslug, open, weights, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by
     from model_classifications
     where open is null
        or classified_at > now() - interval '30 days'
     order by first_ranked_at asc nulls last, first_seen asc`
  )

  const now = Date.now()
  const evidenceString = (row: ClassificationRow, key: string) => {
    const value = row.evidence?.[key]
    return typeof value === 'string' ? value : null
  }

  // Defensive on shape rather than trusting it: this column is jsonb written
  // by a job that has changed twice, and rows survive across deploys, so an
  // older row can carry an older shape. Anything unrecognised reads as "no
  // searches recorded", which is honest, instead of throwing in an admin tool.
  const evidenceSearches = (row: ClassificationRow) => {
    const raw = row.evidence?.['agentSearches']
    if (!Array.isArray(raw)) return []
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const { tool, input, result } = entry as Record<string, unknown>
      if (typeof tool !== 'string') return []
      return [
        {
          tool,
          input: input === undefined ? null : JSON.stringify(input),
          result: typeof result === 'string' ? result : '',
        },
      ]
    })
  }

  return {
    // A pending row for a model the seed already classifies is inert — the
    // seed verdict stands — so it must not appear as work to do.
    pending: rows
      .filter((r) => r.open === null && !OPEN_WEIGHT_MODELS[r.permaslug])
      .map((r) => {
        const firstSeen = new Date(r.first_seen).getTime()
        const firstRankedAt = r.first_ranked_at
          ? new Date(r.first_ranked_at).getTime()
          : null
        return {
          permaslug: r.permaslug,
          openRouterName: evidenceString(r, 'openRouterName'),
          huggingFaceId: evidenceString(r, 'huggingFaceId'),
          discoveredVia: evidenceString(r, 'discoveredVia'),
          firstSeen,
          ageMs: now - firstSeen,
          // Only a ranked model has a deadline — an unranked one is not
          // affecting the index, so it is queue backlog, not an outage.
          firstRankedAt,
          rankedAgeMs: firstRankedAt === null ? null : now - firstRankedAt,
          graceExpired:
            firstRankedAt !== null &&
            now - firstRankedAt > UNCLASSIFIED_GRACE_WINDOW_MS,
          agentRecommendation: evidenceString(r, 'agentRecommendation'),
          agentReasoning: evidenceString(r, 'agentReasoning'),
          // The searches, not just the summary of them. A closed verdict is a
          // negative claim with nothing to machine-check it, which is exactly
          // why it comes to a human — and the only thing that makes it
          // checkable is what the searches actually returned. Shipping the
          // model's own prose about its searches, while the searches sat
          // write-only in the evidence column, asked the operator to confirm
          // an unverifiable claim on the strength of an unverifiable summary.
          agentSearches: evidenceSearches(r),
          // The repo the agent proposed and the live API confirmed. Carried so
          // the operator confirms a filled-in form rather than retyping a repo
          // id from the reasoning text — the recommendation is only worth
          // having if acting on it is one click.
          agentProposedWeights: evidenceString(r, 'agentProposedWeights'),
          agentWeightFileCount:
            typeof r.evidence?.['weightFileCount'] === 'number'
              ? (r.evidence['weightFileCount'] as number)
              : null,
        }
      }),
    recent: rows
      .filter((r) => r.open !== null)
      .map((r) => ({
        permaslug: r.permaslug,
        open: r.open as boolean,
        weights: r.weights,
        source: r.source,
        classifiedAt: r.classified_at
          ? new Date(r.classified_at).getTime()
          : null,
        classifiedBy: r.classified_by,
      }))
      .sort((a, b) => (b.classifiedAt ?? 0) - (a.classifiedAt ?? 0)),
    seedVersion: OPEN_WEIGHT_LIST_VERSION,
    graceWindowMs: UNCLASSIFIED_GRACE_WINDOW_MS,
  }
}

export const setModelClassification: APIHandler<
  'set-model-classification'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const permaslug = basePermaslug(body.permaslug.trim())
  const { open, weights } = body

  // The seed list is the published methodology. Silently overriding an entry
  // from an admin form would change what the index means, so a genuine
  // reclassification has to go through the file — which is also where the
  // reasoning gets recorded.
  //
  // (An earlier comment here said the version is "stamped on every point the
  // oracle writes". It is not: the version reaches the insert LOG line only,
  // and `oracle_prices` has no version column.)
  if (OPEN_WEIGHT_MODELS[permaslug])
    throw new APIError(
      400,
      `${permaslug} is classified in the audited seed list (version ` +
        `${OPEN_WEIGHT_LIST_VERSION}). Reclassifying it is a change to the ` +
        `published methodology — edit common/src/perps/open-weight-models.ts.`
    )

  const pg = createSupabaseDirectClient()
  await upsertClassification(pg, {
    permaslug,
    open,
    weights: weights?.trim() || null,
    source: 'admin',
    evidence: { classifiedByAdmin: auth.uid, weightsCitedAt: Date.now() },
    classifiedBy: auth.uid,
  })

  log(
    `admin ${auth.uid} classified ${permaslug} as ${
      open ? `open (${weights})` : 'closed'
    }`
  )
  return { success: true as const, permaslug, open }
}
