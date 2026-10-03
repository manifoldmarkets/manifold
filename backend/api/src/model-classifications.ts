import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_MODELS,
  UNCLASSIFIED_GRACE_WINDOW_MS,
  basePermaslug,
  isCompositeSlug,
  isValidPermaslug,
} from 'common/perps/open-weight-models'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import {
  isTransportFailure,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
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

  // Every decided row, not a 30-day slice.
  //
  // The nightly audit re-checks EVERY override, and the case it exists to
  // catch is a publisher shipping weights long after launch — months, not
  // weeks. Under the old window the audit would flag such a model every night
  // while the page an operator is told to go and fix it on did not list it at
  // all, which is the worst possible pairing: a standing alert with no
  // reachable remedy.
  //
  // The table is a few hundred rows and grows by a handful a week, so there is
  // nothing to paginate away from yet; `recent` is capped for display below
  // instead, and correcting an older verdict still works through the CLI.
  const rows = await pg.manyOrNone<ClassificationRow>(
    `select permaslug, open, weights, source, evidence,
            first_seen, first_ranked_at, classified_at, classified_by
     from model_classifications
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
      // Composite slugs are excluded from the index by construction, so a
      // verdict on one is ignored whichever way it is answered. Showing them
      // as work to do would be asking for a click that changes nothing.
      .filter(
        (r) =>
          r.open === null &&
          !OPEN_WEIGHT_MODELS[r.permaslug] &&
          !isCompositeSlug(r.permaslug)
      )
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
    // Every decided row an operator can actually act on, uncapped.
    //
    // Not sliced. A previous revision took the newest 200, which reintroduced
    // the exact problem removing the 30-day window was meant to solve: the
    // audit re-checks EVERY override and names the slug in its alert, so any
    // bound here eventually produces a nightly finding pointing at a page
    // that cannot show the row. A cap is only safe alongside search or
    // pagination, and there is neither.
    //
    // Filtered to what the setter will accept, which is also what keeps the
    // list small: seeded models are refused (they go through the file) and
    // composites are refused (excluded from the index), so rendering them
    // would offer a Change control that always errors. Roughly 60 rows today
    // against a few hundred in the table.
    //
    // Revisit if this outgrows a page: the fix is a slug lookup, not a slice.
    recent: rows
      .filter(
        (r) =>
          r.open !== null &&
          !OPEN_WEIGHT_MODELS[r.permaslug] &&
          !isCompositeSlug(r.permaslug)
      )
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
  if (!isValidPermaslug(permaslug))
    throw new APIError(
      400,
      `${JSON.stringify(body.permaslug)} is not a valid owner/model permaslug.`
    )

  if (isCompositeSlug(permaslug))
    throw new APIError(
      400,
      `${permaslug} is a router or floating alias, not a single model. It is ` +
        `excluded from both sides of the index, so a verdict on it would be ` +
        `ignored — see isCompositeSlug in common/src/perps/open-weight-models.ts.`
    )

  if (OPEN_WEIGHT_MODELS[permaslug])
    throw new APIError(
      400,
      `${permaslug} is classified in the audited seed list (version ` +
        `${OPEN_WEIGHT_LIST_VERSION}). Reclassifying it is a change to the ` +
        `published methodology — edit common/src/perps/open-weight-models.ts.`
    )

  const pg = createSupabaseDirectClient()

  // Verify the citation before it enters the map, not after.
  //
  // This endpoint used to accept any non-empty string, which made the admin
  // form the LEAST checked way into an executable index: the nightly audit
  // re-verifies every open verdict, the research agent's proposals are
  // re-fetched and name-matched, and the CLI verifies before writing — but a
  // typo, a full URL pasted instead of an id, a private repo or a
  // tokenizer-only repo typed here went straight in and priced the market on
  // the next tick. `upstage/solar-pro3-tokenizer` resolves and carries zero
  // weight files, so "it exists" is not the bar.
  //
  // The operator is trusted to make the JUDGEMENT; they are not a substitute
  // for the mechanical check, and being asked to re-type a repo id is exactly
  // where a slip happens.
  let evidence: Record<string, unknown> = {
    classifiedByAdmin: auth.uid,
    weightsCitedAt: Date.now(),
  }
  if (open) {
    const cited = weights?.trim() ?? ''
    // Wrapped: verifyHuggingFaceWeights catches fetch rejections but not a
    // malformed body, and an admin form should not 500 because HuggingFace
    // served HTML during an incident.
    let verification
    try {
      verification = await verifyHuggingFaceWeights(cited)
    } catch (err) {
      verification = {
        confirmed: false as const,
        repo: cited,
        reason: `fetch failed: ${err}`,
      }
    }
    if (!verification.confirmed) {
      // 503, not 400, when we could not reach HuggingFace. A timeout, a 429 or
      // a Cloudflare 5xx says nothing about what the operator typed, and
      // telling them their input is invalid during an upstream outage sends
      // them to re-check a repo id that was right — or worse, to work around
      // the form. Retryable, and it says so.
      if (isTransportFailure(verification.reason))
        throw new APIError(
          503,
          `Could not reach HuggingFace to verify ${cited}: ` +
            `${verification.reason}. Nothing was written — retry shortly.`
        )
      throw new APIError(
        400,
        `${cited || '(no repo)'} did not verify as public weights: ` +
          `${verification.reason}. An open call needs a repo that resolves, ` +
          `is public, and carries weight files.`
      )
    }
    evidence = { ...evidence, ...verification.evidence }
  }
  await upsertClassification(pg, {
    permaslug,
    open,
    weights: weights?.trim() || null,
    source: 'admin',
    evidence,
    classifiedBy: auth.uid,
  })

  log(
    `admin ${auth.uid} classified ${permaslug} as ${
      open ? `open (${weights})` : 'closed'
    }`
  )
  return { success: true as const, permaslug, open }
}
