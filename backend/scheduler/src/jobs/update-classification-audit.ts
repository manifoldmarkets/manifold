import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_MODELS,
  basePermaslug,
} from 'common/perps/open-weight-models'
import { verifyHuggingFaceWeights } from 'shared/huggingface'
import { fetchOpenRouterCatalog } from 'shared/openrouter-tokens'
import { resolveModelClassifications } from 'shared/perps/model-classifications'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Re-examine classifications we have ALREADY made.
//
// Everything else in this system looks only at models it has not classified
// yet: the watcher sweeps the catalog for unknowns, the research agent works
// the pending queue, the admin tool lists what needs a click. Once a verdict
// was written, nothing ever looked at it again — so a wrong entry was
// permanent, and a seed entry doubly so, because the seed overrides overrides.
//
// A re-audit on 2026-08-24 found what that costs. Of 299 published
// classifications, four were wrong — Kimi K3, Mistral Large 3 2512, Mistral
// Medium 3.5, Ling-3.0-flash — every one of them an open model marked closed,
// so the index had been understating the open share for weeks with nothing
// capable of noticing.
//
// The direction is structural, not luck. The list is built by finding a
// weights repo; the only way that can fail is by not finding one, and the
// default when it fails is closed. So the errors this system produces are
// systematically one-sided, and the check has to be aimed at that side.
//
// Three assertions, nightly:
//
//   ROT     every `open` verdict cites a repo. Does it still resolve, public,
//           with weight files? microsoft/WizardLM-2-8x22B is the case that
//           motivates it: OpenRouter still declares that repo and the weights
//           were withdrawn, so a citation is not evidence of anything unless
//           something re-checks it.
//
//   HINTS   every `closed` verdict, against OpenRouter's own metadata. Note
//           the direction: the watcher already measured `hugging_face_id`
//           agreement across models we call OPEN (96 of 99) and was satisfied.
//           Nobody checked whether it CONTRADICTS us where we say closed, and
//           that is exactly where all four errors were sitting.
//
//   PROSE   the same closed verdicts against the description text. Two of the
//           four had an empty `hugging_face_id` and announced themselves in
//           words instead ("open-weight", "released under the Apache 2.0
//           license"). Cheap, and it is the only signal that catches a
//           publisher who renames between OpenRouter slug and HF repo — the
//           rename being what defeated the original build.
//
// This job never writes a classification. It raises a flag for a human,
// because a verdict that moves an executable index should not be flipped by
// the same kind of automated inference that got it wrong in the first place.

/** Phrases that assert public weights in OpenRouter's own prose. */
const OPENNESS_PHRASES = [
  'open-weight',
  'open weights',
  'open-source',
  'open source',
  'apache 2.0',
  'apache-2.0',
  'mit license',
  'weights are available',
  'weights available',
]

/**
 * Phrases that assert the opposite, and which veto an openness match.
 *
 * Needed because these blurbs routinely describe a closed model by naming the
 * open one it derives from, and a bare substring search reads the wrong half:
 * "Qwen3 Coder Plus is Alibaba's proprietary version of the Open Source Qwen3
 * Coder 480B A35B" contains "open source" and is a closed model. That was the
 * only false positive across all 124 closed verdicts on the first run.
 *
 * Vetoing loses nothing real. A publisher describing genuinely open weights
 * has no reason to also call the model proprietary, and the declared-repo
 * check runs first and independently — prose is the weaker of the two signals
 * and only ever needs to be right about the cases the repo check misses.
 */
const PROPRIETARY_PHRASES = [
  'proprietary',
  'closed-weight',
  'closed weights',
  'closed-source',
  'not open',
]

const describesOpenness = (description: string | null) => {
  if (!description) return null
  const haystack = description.toLowerCase()
  if (PROPRIETARY_PHRASES.some((phrase) => haystack.includes(phrase))) return null
  return OPENNESS_PHRASES.find((phrase) => haystack.includes(phrase)) ?? null
}

export const updateClassificationAudit = async () => {
  try {
    await runClassificationAudit()
  } catch (err) {
    log.error(`[classification-audit] run failed — ${err}`)
  }
}

const runClassificationAudit = async () => {
  const pg = createSupabaseDirectClient()
  const { classifications } = await resolveModelClassifications(pg)
  const catalog = await fetchOpenRouterCatalog()
  const byPermaslug = Object.fromEntries(
    catalog.map((entry) => [basePermaslug(entry.permaslug), entry])
  )

  const rot: string[] = []
  const contradicted: string[] = []
  let openChecked = 0
  let closedChecked = 0

  for (const [permaslug, verdict] of Object.entries(classifications)) {
    const seeded = !!OPEN_WEIGHT_MODELS[permaslug]
    const origin = seeded ? 'seed' : 'override'

    if (verdict.open) {
      openChecked++
      // An open verdict without a citation cannot be audited at all, and the
      // table's check constraint plus the seed's own test both forbid it —
      // so if one appears, that is the finding.
      if (!verdict.weights) {
        rot.push(`${permaslug} [${origin}] — open with no weights repo cited`)
        continue
      }
      const result = await verifyHuggingFaceWeights(verdict.weights)
      if (!result.confirmed)
        rot.push(
          `${permaslug} [${origin}] — ${verdict.weights} no longer verifies: ${result.reason}`
        )
      continue
    }

    closedChecked++
    const entry = byPermaslug[permaslug]
    if (!entry) continue

    // HINTS: OpenRouter declares a repo for something we call closed. Only a
    // finding if the repo actually carries public weights — a declared but
    // empty or withdrawn repo agrees with us, it does not contradict us.
    if (entry.huggingFaceId) {
      const result = await verifyHuggingFaceWeights(entry.huggingFaceId)
      if (result.confirmed) {
        contradicted.push(
          `${permaslug} [${origin}] — we say closed, OpenRouter declares ` +
            `${entry.huggingFaceId} (${result.evidence.weightFileCount} weight files, ` +
            `gated=${result.evidence.gated})`
        )
        continue
      }
    }

    // PROSE: no usable declared repo, but the blurb claims openness.
    const phrase = describesOpenness(entry.description)
    if (phrase)
      contradicted.push(
        `${permaslug} [${origin}] — we say closed, but OpenRouter's ` +
          `description says "${phrase}"`
      )
  }

  log(
    `[classification-audit] checked ${openChecked} open + ${closedChecked} closed ` +
      `(list ${OPEN_WEIGHT_LIST_VERSION})`
  )

  // Warn, not error, and deliberately: neither finding means the index is
  // wrong right now. A rot finding can be a transient HF outage, and a
  // contradiction can be OpenRouter's metadata being wrong — it was, for
  // three models in the 2026-08-24 audit. Both need a human to look, and
  // paging on something that is often a false positive trains people to
  // ignore it. What must not happen is nobody being told at all, which is
  // the state this job replaces.
  if (rot.length > 0)
    log.warn(
      `[classification-audit] ${rot.length} open verdict(s) no longer verify:\n  ` +
        rot.join('\n  ')
    )
  if (contradicted.length > 0)
    log.warn(
      `[classification-audit] ${contradicted.length} closed verdict(s) contradicted by ` +
        `OpenRouter metadata — review at /admin/model-classifications:\n  ` +
        contradicted.join('\n  ')
    )
  if (rot.length === 0 && contradicted.length === 0)
    log(`[classification-audit] no disagreements`)

  return { rot, contradicted, openChecked, closedChecked }
}
