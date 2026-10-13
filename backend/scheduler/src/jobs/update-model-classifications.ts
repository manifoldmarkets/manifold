import { uniq } from 'lodash'
import { authorOfPermaslug } from 'common/perps/lab-share'
import {
  OPEN_WEIGHT_MODELS,
  basePermaslug,
  isCompositeSlug,
} from 'common/perps/open-weight-models'
import {
  logHuggingFaceVerification,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
import {
  AGENT_RESEARCH_COOLDOWN_MS,
  getPendingClassifications,
  getProvisionalClassifications,
  getResearchEligibility,
  provisionalCheckedAt,
  recordAgentRecommendation,
  recordPendingModels,
  upsertClassification,
} from 'shared/perps/model-classifications'
import {
  PROVISIONAL_RECHECK_INTERVAL_MS,
  isDueForRecheck,
} from 'shared/perps/classification-recheck'
import { classifyModelWithAgent } from 'shared/perps/classify-model-agent'
import {
  LabAgentSubject,
  classifyLabSubjectWithAgent,
} from 'shared/perps/classify-lab-agent'
import {
  LabClassificationRow,
  getLabResearchCandidates,
  labCheckedAt,
  recordLabAgentRecommendation,
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
 * Hard ceiling on research calls in one sweep, per population — pending
 * models, provisional models under watch, and lab subjects each get their
 * own ten.
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
  if (unknown.length === 0) log('[model-classifier] catalog fully classified')
  else await classifyUnknownModels(pg, unknown)

  // Both run whether or not the catalog had anything new: a watched row is
  // settled as far as the catalog sweep is concerned, and the lab queue is
  // independent of it.
  await recheckProvisionalModels(pg, catalog)
  await researchLabSubjects(pg, catalog)
}

/** The catalog sweep: pending rows, declared-repo auto-open, agent research. */
const classifyUnknownModels = async (
  pg: SupabaseDirectClient,
  unknown: OpenRouterCatalogEntry[]
) => {
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

/**
 * Re-examine the "I don't know" rows.
 *
 * A provisional verdict is closed applied as the default: the operator looked
 * and found no public weights, for a model that is anonymous or whose weights
 * are announced and unshipped. The index publishes it as closed. What this
 * loop asks, weekly, is whether that has stopped being true — because before
 * it existed nothing did. The nightly audit re-checks closed verdicts only
 * against OpenRouter's own metadata, which is populated for 40% of models and
 * says nothing about a reveal, and the research agent only ever looked at
 * rows with no verdict. A closed-for-now verdict was closed forever.
 *
 * Two checks, with different consequences, mirroring the pending path:
 *
 *   DECLARED REPO. The catalog now carries a `hugging_face_id` for the model
 *   and it verifies with public weight files. This is APPLIED: the row flips
 *   to open, source `auto`, prior verdict archived in history. Same trust the
 *   pending path extends to the same evidence — the publisher is the
 *   authority on which repo is theirs, nothing is inferred — and the row is
 *   one the operator explicitly asked to have re-decided when evidence
 *   appeared. (A FIRM closed verdict on this evidence is only flagged, by the
 *   audit, because there a human looked and said no.)
 *
 *   AGENT. The HuggingFace research agent, same as for a pending model. An
 *   `open` finding is a recommendation on the row and an ERROR-level alert:
 *   the index is publishing a number the research now contradicts, and a
 *   human decides, not a name heuristic. `closed` re-confirms the default and
 *   `unresolved` leaves it; both just restart the weekly clock.
 *
 * Not ranked-gated: the set is bounded by human clicks rather than by the
 * catalog, and a model delisted from the catalog — how stealth models usually
 * end — still gets the agent, which is what can find the reveal.
 */
const recheckProvisionalModels = async (
  pg: SupabaseDirectClient,
  catalog: OpenRouterCatalogEntry[]
) => {
  const now = Date.now()
  const watched = await getProvisionalClassifications(pg)
  if (watched.length === 0) return
  const due = watched.filter((row) =>
    isDueForRecheck(
      provisionalCheckedAt(row),
      PROVISIONAL_RECHECK_INTERVAL_MS,
      now
    )
  )
  const models = due.slice(0, MAX_RESEARCH_PER_SWEEP)
  if (due.length > models.length)
    log.error(
      `[model-classifier] ${due.length} provisional verdicts due for re-check, ` +
        `capped at ${MAX_RESEARCH_PER_SWEEP} this sweep — deferring: ` +
        due
          .slice(MAX_RESEARCH_PER_SWEEP)
          .map((row) => row.permaslug)
          .join(', ')
    )
  log(
    `[model-classifier] ${watched.length} provisional closed verdict(s) under ` +
      `watch, ${due.length} due, ${models.length} re-checked this sweep`
  )
  if (models.length === 0) return

  const byPermaslug = Object.fromEntries(
    catalog.map((entry) => [basePermaslug(entry.permaslug), entry])
  )
  let flipped = 0
  let contradicted = 0
  let reconfirmed = 0
  let unresolved = 0
  for (const row of models) {
    const slug = basePermaslug(row.permaslug)
    const entry = byPermaslug[slug]
    const recordedName = row.evidence?.['openRouterName']
    const name =
      entry?.name ??
      (typeof recordedName === 'string' ? recordedName : undefined)

    if (entry?.huggingFaceId) {
      const verification = await verifyHuggingFaceWeights(entry.huggingFaceId)
      logHuggingFaceVerification(slug, verification)
      if (verification.confirmed) {
        await upsertClassification(pg, {
          permaslug: slug,
          open: true,
          weights: verification.repo,
          source: 'auto',
          evidence: {
            ...verification.evidence,
            openRouterName: name ?? null,
            supersededProvisional: true,
          },
        })
        log.warn(
          `[model-classifier] ${slug}: provisional closed -> OPEN — publisher ` +
            `now declares ${verification.repo} ` +
            `(${verification.evidence.weightFileCount} weight files, verified)`
        )
        flipped++
        continue
      }
    }

    if (!isProd()) {
      unresolved++
      continue
    }
    const result = await classifyModelWithAgent({
      permaslug: slug,
      name,
      declaredHuggingFaceId: entry?.huggingFaceId ?? null,
    })
    const evidence = {
      openRouterName: name ?? null,
      agentReasoning: result.verdict.reasoning,
      agentSearches: result.searches.map((s) => ({
        tool: s.tool,
        input: s.input,
        result: s.result.slice(0, 1000),
      })),
      rejectedReason: result.rejectedReason ?? null,
    }
    if (result.verdict.verdict === 'open') {
      await recordAgentRecommendation(pg, slug, 'open', {
        ...evidence,
        agentProposedWeights: result.verdict.weights,
        ...(result.confirmation?.confirmed ? result.confirmation.evidence : {}),
      })
      log.error(
        `[model-classifier] ${slug}: provisional closed verdict CONTRADICTED — ` +
          `research found public weights at ${result.verdict.weights} ` +
          `(verified); review at /admin/model-classifications`
      )
      contradicted++
      continue
    }
    if (result.verdict.verdict === 'closed') {
      await recordAgentRecommendation(pg, slug, 'closed', evidence)
      reconfirmed++
      continue
    }
    await recordAgentRecommendation(pg, slug, null, evidence, !result.transient)
    unresolved++
  }
  log(
    `[model-classifier] provisional re-check: ${flipped} flipped open from a ` +
      `declared repo, ${contradicted} contradicted by research (alerted), ` +
      `${reconfirmed} re-confirmed closed, ${unresolved} unresolved` +
      (isProd() ? '' : ' (agent skipped outside prod)')
  )
}

/**
 * Research the Chinese-lab queue: the lab-side twin of researchRemainingModels
 * and of the provisional re-check above, in one loop because the agent and
 * the bookkeeping are the same and only the cooldown and the meaning of a
 * finding differ by row.
 *
 * Until now this queue had no research at all. Every verdict was typed by a
 * human, with an evidence line and a source URL, which for an anonymous
 * stealth model meant inventing both. Now the agent does the searching and the
 * human confirms a prefilled form — or, having defaulted a subject to
 * non-Chinese provisionally, is told when a reveal or a headquarters turns up.
 *
 * Nothing is applied. There is no deterministic evidence for a headquarters
 * the way a publisher-declared repo is for weights, so every finding is a
 * recommendation. A `chinese` finding on a provisional row is additionally an
 * ERROR-level alert: the index is publishing that row as non-Chinese.
 */
const researchLabSubjects = async (
  pg: SupabaseDirectClient,
  catalog: OpenRouterCatalogEntry[]
) => {
  const now = Date.now()
  const candidates = await getLabResearchCandidates(pg)
  if (candidates.length === 0) return
  const due = candidates.filter((row) =>
    isDueForRecheck(
      labCheckedAt(row),
      row.provisional
        ? PROVISIONAL_RECHECK_INTERVAL_MS
        : AGENT_RESEARCH_COOLDOWN_MS,
      now
    )
  )
  const subjects = due.slice(0, MAX_RESEARCH_PER_SWEEP)
  if (due.length > subjects.length)
    log.error(
      `[lab-classifier] ${due.length} subjects due for research, capped at ` +
        `${MAX_RESEARCH_PER_SWEEP} this sweep — deferring: ` +
        due
          .slice(MAX_RESEARCH_PER_SWEEP)
          .map((row) => `${row.subject_type}:${row.subject_slug}`)
          .join(', ')
    )
  const provisionalCount = candidates.filter((row) => row.provisional).length
  log(
    `[lab-classifier] ${candidates.length} subject(s) eligible for research ` +
      `(${candidates.length - provisionalCount} ranked and pending, ` +
      `${provisionalCount} provisional under watch), ${due.length} due, ` +
      `${subjects.length} researched this sweep`
  )
  if (subjects.length === 0) return
  if (!isProd()) {
    log('[lab-classifier] skipping paid agent research outside prod')
    return
  }

  let placed = 0
  let contradicted = 0
  let unattributed = 0
  let unresolved = 0
  for (const row of subjects) {
    const result = await classifyLabSubjectWithAgent(
      labAgentSubject(row, catalog)
    )
    const { verdict } = result
    const placement =
      verdict.verdict === 'chinese' || verdict.verdict === 'non-chinese'
        ? verdict
        : null
    const evidence = {
      agentRecommendation:
        verdict.verdict === 'unresolved' ? null : verdict.verdict,
      agentPublisher: placement?.publisher ?? null,
      agentHeadquarters: placement?.headquarters ?? null,
      agentSourceUrl: placement?.sourceUrl ?? null,
      agentReasoning: verdict.reasoning,
      agentSearches: result.searches.map((search) => ({
        query: search.query,
        error: search.error ?? null,
        results: search.results.slice(0, 10),
      })),
      rejectedReason: result.rejectedReason ?? null,
    }
    await recordLabAgentRecommendation(
      pg,
      row.subject_type,
      row.subject_slug,
      evidence,
      !result.transient
    )

    const label = `${row.subject_type} ${row.subject_slug}`
    if (placement) {
      placed++
      const summary = `${placement.publisher}, ${placement.headquarters} (${placement.sourceUrl})`
      if (row.provisional && placement.verdict === 'chinese') {
        contradicted++
        log.error(
          `[lab-classifier] ${label}: provisional non-Chinese verdict ` +
            `CONTRADICTED — research attributes it to ${summary}; review at ` +
            `/admin/model-classifications`
        )
      } else
        log.warn(
          `[lab-classifier] ${label}: research recommends ${placement.verdict} — ` +
            `${summary}; awaiting confirmation`
        )
      continue
    }
    if (verdict.verdict === 'unattributed') unattributed++
    else unresolved++
    log(
      `[lab-classifier] ${label}: ${
        verdict.verdict
      } — ${verdict.reasoning.slice(0, 200)}`
    )
  }
  log(
    `[lab-classifier] research: ${placed} placement(s) recommended ` +
      `(${contradicted} contradicting a provisional verdict, alerted), ` +
      `${unattributed} still unattributed, ${unresolved} unresolved`
  )
}

/** What the catalog knows about a subject, for the agent's prompt. */
const labAgentSubject = (
  row: LabClassificationRow,
  catalog: OpenRouterCatalogEntry[]
): LabAgentSubject => {
  const recordedNames = row.evidence?.['openRouterNames']
  const recorded = [
    row.evidence?.['openRouterName'],
    ...(Array.isArray(recordedNames) ? recordedNames : []),
  ].filter((value): value is string => typeof value === 'string' && !!value)
  const entries =
    row.subject_type === 'model'
      ? catalog.filter(
          (entry) => basePermaslug(entry.permaslug) === row.subject_slug
        )
      : catalog.filter(
          (entry) => authorOfPermaslug(entry.permaslug) === row.subject_slug
        )
  return {
    subjectType: row.subject_type,
    subjectSlug: row.subject_slug,
    openRouterNames: uniq([...entries.map((entry) => entry.name), ...recorded])
      .filter((name) => !!name)
      .slice(0, 6),
    descriptions: uniq(
      entries
        .map((entry) => entry.description)
        .filter((description): description is string => !!description)
    ).slice(0, 3),
    relatedPermaslugs: uniq(
      entries.map((entry) => basePermaslug(entry.permaslug))
    ).slice(0, 8),
    inCatalog: entries.length > 0,
    provisional: row.provisional,
  }
}
