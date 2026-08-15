import { OPEN_WEIGHT_MODELS } from 'common/perps/open-weight-models'
import {
  logHuggingFaceVerification,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
import {
  getPendingClassifications,
  getResearchEligibility,
  recordAgentRecommendation,
  recordPendingModels,
  upsertClassification,
} from 'shared/perps/model-classifications'
import { classifyModelWithAgent } from 'shared/perps/classify-model-agent'
import {
  fetchOpenRouterCatalog,
  OpenRouterCatalogEntry,
} from 'shared/openrouter-tokens'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

// Classify new OpenRouter models BEFORE they reach the top 50.
//
// The open-weight index halts on models it cannot classify. That is the right
// default — a mis-defaulted frontier launch would move an executable index
// several points on a guess — but for three weeks running it meant the feed
// froze overnight whenever a new model climbed into the rankings, while the
// perp kept marking and charging funding against a stale oracle.
//
// The models were never actually a surprise. Each one sat in OpenRouter's
// catalog first: muse-spark for 22 days, solar-pro4 for three, nemotron-3.5-
// lightning for one. This job spends that lead time, so the common case is
// resolved before it can matter and the rest is a review queue rather than an
// outage.
//
// It only ever decides OPEN, and only on confirmed public weight files. It
// never concludes closed — see the directionality note in shared/huggingface.
// Anything it cannot confirm stays pending for a human, which is what the
// admin tool and the grace window exist for.
/**
 * Hard ceiling on research calls in one sweep.
 *
 * Sized against reality rather than ambition: in the worst week on record
 * three previously-unseen models entered the top 50, and the job runs four
 * times a day. Ten leaves a wide margin over that while bounding a runaway
 * sweep to a known, small number.
 */
const MAX_RESEARCH_PER_SWEEP = 10

export const updateModelClassifications = async () => {
  try {
    await updateModelClassificationsInternal()
  } catch (err) {
    // Tagged so a watcher outage is findable on its own, rather than only
    // showing up later as an unexplained feed halt.
    log.error(`[model-classifier] run failed — ${err}`)
  }
}

const updateModelClassificationsInternal = async () => {
  const pg = createSupabaseDirectClient()

  const catalog = await fetchOpenRouterCatalog()
  const adjudicated = await pg.manyOrNone<{ permaslug: string }>(
    `select permaslug from model_classifications where open is not null`
  )
  const settled = new Set(adjudicated.map((r) => r.permaslug))

  const unknown = catalog.filter(
    (m) => !OPEN_WEIGHT_MODELS[m.permaslug] && !settled.has(m.permaslug)
  )
  if (unknown.length === 0) {
    log('[model-classifier] catalog fully classified')
    return
  }

  // Start the grace clock from when WE first saw the model, not from
  // OpenRouter's listing date: backdating would expire the entire first-run
  // backlog on the spot and halt the feed for a problem nobody has had a
  // chance to look at yet.
  await recordPendingModels(
    pg,
    unknown.map((m) => ({
      permaslug: m.permaslug,
      name: m.name,
      huggingFaceId: m.huggingFaceId,
      discoveredVia: 'catalog' as const,
    }))
  )

  // Re-verify every pending model each run, not just the newly seen ones:
  // OpenRouter frequently populates `hugging_face_id` days after listing, and
  // labs publish weights after launch. Both cases resolve themselves here.
  let confirmed = 0
  const needsResearch: typeof unknown = []
  for (const model of unknown) {
    if (!model.huggingFaceId) {
      needsResearch.push(model)
      continue
    }
    const verification = await verifyHuggingFaceWeights(model.huggingFaceId)
    logHuggingFaceVerification(model.permaslug, verification)
    if (!verification.confirmed) {
      needsResearch.push(model)
      continue
    }
    await upsertClassification(pg, {
      permaslug: model.permaslug,
      open: true,
      weights: verification.repo,
      source: 'auto',
      evidence: { ...verification.evidence, openRouterName: model.name },
    })
    confirmed++
  }

  const researched = await researchRemainingModels(pg, needsResearch)

  const pending = await getPendingClassifications(pg)
  // Split the queue the way the index sees it. A pending model that has never
  // ranked is backlog — it is excluded from an index it was never part of, and
  // nobody needs to act on it. A pending model that HAS ranked is the live
  // queue: it is being excluded under grace right now, and its window is
  // running. Reporting one number for both buried three urgent rows in a
  // hundred-plus inert ones and made the warning unreadable.
  const rankedPending = pending.filter((p) => p.first_ranked_at)
  log(
    `[model-classifier] ${unknown.length} unclassified in catalog: ` +
      `${confirmed} auto-classified open from a declared repo, ` +
      `${researched.confirmed} open via research, ` +
      `${researched.recommended} closed-recommendations for review, ` +
      `${researched.unresolved} unresolved; ${rankedPending.length} ranked ` +
      `awaiting review, ${pending.length - rankedPending.length} unranked backlog`
  )

  // Warn rather than error: a pending model is not yet a problem — the index
  // publishes under grace while it is small and fresh. It becomes an error
  // only when the publication gate actually halts on it, which the
  // [openrouter] tag reports with the numbers that justify it.
  if (rankedPending.length > 0)
    log.warn(
      `[model-classifier] ranked and awaiting human classification: ${rankedPending
        .map((p) => p.permaslug)
        .join(', ')}`
    )
}

/**
 * Hand whatever the deterministic pass could not settle to the research agent.
 *
 * This is the half that kept freezing the feed: models with no declared repo,
 * where deciding means actually searching HuggingFace rather than fetching one
 * URL. The agent runs the same searches a human would and its `open` verdicts
 * are re-verified against the live API before they land, so the automation can
 * only ever be as wrong as the API is.
 *
 * `closed` comes back as a recommendation, not a classification. Nothing
 * machine-checks a negative claim, and with the grace threshold in place an
 * unclassified model no longer halts the index — so the cheap, correct move is
 * to leave it pending with the research attached and let a human confirm in
 * one click. Set PERPS_AUTOCLASSIFY_CLOSED=true to apply them automatically;
 * it is off by default deliberately.
 *
 * Because a recommendation leaves the row pending by design, the candidate set
 * does NOT shrink on its own — which is what makes the two filters below load-
 * bearing rather than an optimisation. Without them this loop re-researches
 * every unsettled model on every sweep, indefinitely: ~130 catalog models,
 * four times a day, whose verdicts cannot change between runs.
 */
const researchRemainingModels = async (
  pg: SupabaseDirectClient,
  candidates: OpenRouterCatalogEntry[]
) => {
  const autoApplyClosed = process.env.PERPS_AUTOCLASSIFY_CLOSED === 'true'
  let confirmed = 0
  let recommended = 0
  let unresolved = 0

  // Spend follows the index, not the catalog: research only models that have
  // actually entered the ranked window, and not ones researched recently
  // enough that the answer cannot have changed. See getResearchEligibility.
  const { everRanked, recentlyResearched } = await getResearchEligibility(pg)
  const rankedSet = new Set(everRanked)
  const cooledSet = new Set(recentlyResearched)

  const eligible = candidates.filter(
    (m) => rankedSet.has(m.permaslug) && !cooledSet.has(m.permaslug)
  )
  const skippedUnranked = candidates.filter((m) => !rankedSet.has(m.permaslug))
  const skippedCooldown = candidates.filter(
    (m) => rankedSet.has(m.permaslug) && cooledSet.has(m.permaslug)
  )

  // A last-resort ceiling on a single sweep, so a pathological run (an
  // upstream shape change, a HuggingFace outage pushing every declared-repo
  // model into this path) cannot turn into an unbounded bill. Reaching it is
  // an anomaly, not a routine truncation — hence log.error, not a silent slice.
  const models = eligible.slice(0, MAX_RESEARCH_PER_SWEEP)
  if (eligible.length > models.length)
    log.error(
      `[model-classifier] ${eligible.length} models eligible for research, ` +
        `capped at ${MAX_RESEARCH_PER_SWEEP} this sweep — deferring: ` +
        eligible
          .slice(MAX_RESEARCH_PER_SWEEP)
          .map((m) => m.permaslug)
          .join(', ')
    )

  log(
    `[model-classifier] research candidates: ${candidates.length} unsettled, ` +
      `${skippedUnranked.length} never ranked (cannot move the index), ` +
      `${skippedCooldown.length} inside the research cooldown, ` +
      `${models.length} researched this sweep`
  )

  for (const model of models) {
    const result = await classifyModelWithAgent({
      permaslug: model.permaslug,
      name: model.name,
      declaredHuggingFaceId: model.huggingFaceId,
    })
    const evidence = {
      openRouterName: model.name,
      agentReasoning: result.verdict.reasoning,
      // The tool calls the verdict rests on, so an operator reviewing this
      // sees what was actually searched rather than a bare assertion.
      agentSearches: result.searches.map((s) => ({
        tool: s.tool,
        input: s.input,
        result: s.result.slice(0, 1000),
      })),
      rejectedReason: result.rejectedReason ?? null,
    }

    if (result.verdict.verdict === 'open') {
      await upsertClassification(pg, {
        permaslug: model.permaslug,
        open: true,
        weights: result.verdict.weights,
        source: 'auto',
        evidence: { ...evidence, ...(result.confirmation?.confirmed
          ? result.confirmation.evidence
          : {}) },
      })
      confirmed++
      continue
    }

    if (result.verdict.verdict === 'closed') {
      if (autoApplyClosed) {
        await upsertClassification(pg, {
          permaslug: model.permaslug,
          open: false,
          source: 'auto',
          evidence,
        })
        confirmed++
        continue
      }
      await recordAgentRecommendation(pg, model.permaslug, 'closed', evidence)
      recommended++
      log.warn(
        `[model-classifier] ${model.permaslug}: agent recommends CLOSED — ` +
          `${result.verdict.reasoning.slice(0, 300)}`
      )
      continue
    }

    // A transient failure starts no cooldown. Recording `agentRanAt` here
    // would mark the model researched when nothing was learned, and since the
    // cooldown is a fraction of the grace window, that would burn one of the
    // few retries a ranked model gets before its window expires and the feed
    // halts. Attach the evidence either way so the queue shows what happened.
    await recordAgentRecommendation(
      pg,
      model.permaslug,
      null,
      evidence,
      !result.transient
    )
    unresolved++
  }

  return { confirmed, recommended, unresolved }
}
