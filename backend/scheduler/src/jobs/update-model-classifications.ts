import {
  OPEN_WEIGHT_MODELS,
  isCompositeSlug,
} from 'common/perps/open-weight-models'
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
  recordPendingLabSubjectsFromCatalog,
  resolveLabClassifications,
} from 'shared/perps/lab-classifications'
import {
  fetchOpenRouterCatalog,
  OpenRouterCatalogEntry,
} from 'shared/openrouter-tokens'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { isProd, log } from 'shared/utils'

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
// It decides one thing on its own: OPEN, from a repo the PUBLISHER declared,
// confirmed to carry public weight files. That is safe to automate because the
// publisher is the authority on which repo is theirs — there is no identity
// inference involved, only verification of a claim they made. Measured against
// the 243 audited seed entries, `hugging_face_id` present agrees with the audit
// on 96 of 99 open models, and the three disagreements are declared-but-empty
// repos that verification rejects anyway.
//
// Everything else is a recommendation for a human, including the research
// agent's OPEN verdicts — see researchRemainingModels for why a verified,
// name-matched repo still is not proof of identity. The admin tool and the
// grace window are what make that affordable: an unclassified model no longer
// halts the index while it waits for a click.
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

  // The same catalog fetch also supplies the Chinese-lab author queue. Do
  // this before the model classifier's early return: an author such as
  // nex-agi can be new to the lab index even when all of its models already
  // have open-weight verdicts. Live rankings provide a second discovery path.
  try {
    const labClassifications = await resolveLabClassifications(pg)
    await recordPendingLabSubjectsFromCatalog(
      pg,
      catalog,
      Date.now(),
      labClassifications
    )
  } catch (err) {
    // This queue is operationally independent of the open-weight model
    // classifier. A migration/config bug here must not suppress model work.
    log.error(`[lab-classifier] catalog discovery failed — ${err}`)
  }

  const adjudicated = await pg.manyOrNone<{ permaslug: string }>(
    `select permaslug from model_classifications where open is not null`
  )
  const settled = new Set(adjudicated.map((r) => r.permaslug))

  // Composites are filtered HERE, at candidate creation, not only where rows
  // are written. Everything downstream — the pending insert, the research
  // shortlist, the summary counts — is derived from this list, so filtering
  // later left routers and aliases eligible for a paid research call and an
  // automatic verdict that the index would then ignore.
  const unknown = catalog.filter(
    (m) =>
      !OPEN_WEIGHT_MODELS[m.permaslug] &&
      !settled.has(m.permaslug) &&
      !isCompositeSlug(m.permaslug)
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
      `${researched.recommended} agent recommendations for review, ` +
      `${researched.unresolved} unresolved; ${rankedPending.length} ranked ` +
      `awaiting review, ${
        pending.length - rankedPending.length
      } unranked backlog`
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
 * NOTHING the agent concludes is applied automatically. Every verdict lands as
 * a recommendation on a still-pending row, and a human confirms it in one click
 * from the admin queue.
 *
 * That holds for `open` as well as `closed`, and the `open` case is the
 * deliberate part. An open verdict looks machine-checkable — the cited repo is
 * re-fetched from the live API and must carry public weight files, and its name
 * must fully match the model's. But those checks establish that a real,
 * public, weight-bearing repo exists under a similar name; they cannot
 * establish that it is THIS model's. Identity is not a string comparison, and
 * the guard has already been wrong twice in review on repos that passed
 * verification cleanly. Patching each case closes that case; requiring a human
 * closes the class.
 *
 * The trade is affordable precisely because of the ranked-only gate above: the
 * queue is a handful of models a week, so this is a click each, and the agent
 * still does all the legwork — the repo, its verification, and every search are
 * attached to the row.
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
  if (!isProd()) {
    log('[model-classifier] skipping paid agent research outside prod')
    return { recommended: 0, unresolved: candidates.length }
  }

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
      // A verified, name-matched repo is still only a RECOMMENDATION.
      //
      // Verification proves the cited repo is public and carries weight files.
      // The name guard proves the repo's name looks like this model's. Neither
      // proves the repo IS this model — that is an identity claim, and no
      // string comparison establishes identity. The guard has now been wrong
      // twice in review, in a class we only found by going looking: a
      // single-token family name matching any sibling, and parameter counts
      // tokenized away so a 30B repo matched a 480B model. Both cited real,
      // public, weight-bearing repos, so verification confirmed both.
      //
      // Each patch closed the case we thought of. Requiring a human closes the
      // class. The cost is one click on a handful of models a week; the thing
      // it buys is that a name heuristic can no longer move a market that
      // settles real money.
      //
      // The repo and its verification ride along so the click stays one click:
      // the queue prefills the input with the repo and shows what the live API
      // returned for it.
      await recordAgentRecommendation(pg, model.permaslug, 'open', {
        ...evidence,
        agentProposedWeights: result.verdict.weights,
        ...(result.confirmation?.confirmed ? result.confirmation.evidence : {}),
      })
      recommended++
      log(
        `[model-classifier] ${model.permaslug}: agent recommends OPEN — ` +
          `${result.verdict.weights} (verified, awaiting confirmation)`
      )
      continue
    }

    if (result.verdict.verdict === 'closed') {
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

  return { recommended, unresolved }
}
