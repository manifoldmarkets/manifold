import { OPEN_WEIGHT_MODELS } from 'common/perps/open-weight-models'
import {
  logHuggingFaceVerification,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
import {
  getPendingClassifications,
  recordPendingModels,
  upsertClassification,
} from 'shared/perps/model-classifications'
import { fetchOpenRouterCatalog } from 'shared/openrouter-tokens'
import { createSupabaseDirectClient } from 'shared/supabase/init'
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
  let unresolved = 0
  for (const model of unknown) {
    if (!model.huggingFaceId) {
      unresolved++
      continue
    }
    const verification = await verifyHuggingFaceWeights(model.huggingFaceId)
    logHuggingFaceVerification(model.permaslug, verification)
    if (!verification.confirmed) {
      unresolved++
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

  const pending = await getPendingClassifications(pg)
  log(
    `[model-classifier] ${unknown.length} unclassified in catalog: ` +
      `${confirmed} auto-classified open, ${unresolved} unresolved; ` +
      `${pending.length} awaiting review`
  )

  // Warn rather than error: a pending model is not yet a problem — the index
  // publishes under grace while it is small and fresh. It becomes an error
  // only when the publication gate actually halts on it, which the
  // [openrouter] tag reports with the numbers that justify it.
  if (pending.length > 0)
    log.warn(
      `[model-classifier] awaiting human classification: ${pending
        .map((p) => p.permaslug)
        .join(', ')}`
    )
}
