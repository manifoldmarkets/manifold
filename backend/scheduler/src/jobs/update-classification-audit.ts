import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_MODELS,
  basePermaslug,
} from 'common/perps/open-weight-models'
import {
  isTransportFailure,
  verifyHuggingFaceWeights,
} from 'shared/huggingface'
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

/**
 * Did this verification fail because the repo is genuinely not public, or
 * because we could not reach HuggingFace?
 *
 * The distinction is the difference between a finding and noise. A network
 * blip, a 5xx, or a rate-limit answer produces `confirmed: false` exactly like
 * a withdrawn repo does — and reporting those as "no longer verifies" would
 * put every open model in the warn on a bad night, which is how an alert stops
 * being read. Only reasons that assert something about the repo count as rot.
 */
/**
 * Verify without letting one bad response end the night.
 *
 * `verifyHuggingFaceWeights` catches fetch rejections but not a malformed body
 * — `await res.json()` throws on a truncated or HTML response, which HF serves
 * during incidents. Unwrapped, that propagated out of the loop and discarded
 * every finding gathered so far, including ones already confirmed.
 */
const safeVerify = async (repo: string) => {
  try {
    return await verifyHuggingFaceWeights(repo)
  } catch (err) {
    return {
      confirmed: false as const,
      repo,
      reason: `fetch failed: ${err}`,
    }
  }
}

export const updateClassificationAudit = async () => {
  try {
    await runClassificationAudit()
  } catch (err) {
    log.error(`[classification-audit] run failed — ${err}`)
  }
}

export const runClassificationAudit = async () => {
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
  let unreachable = 0
  // Closed verdicts split three ways, because "checked" was previously
  // incremented before anything was actually checked: a model absent from the
  // catalog and one whose declared repo could not be fetched both counted as
  // checked while producing no finding, so the job could print "checked N
  // closed / no disagreements" having verified none of them.
  let closedVerified = 0
  let closedNoCatalogEntry = 0
  let closedUnreachable = 0

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
      const result = await safeVerify(verdict.weights)
      if (!result.confirmed) {
        if (isTransportFailure(result.reason)) unreachable++
        else
          rot.push(
            `${permaslug} [${origin}] — ${verdict.weights} no longer verifies: ${result.reason}`
          )
      }
      continue
    }

    closedChecked++
    const entry = byPermaslug[permaslug]
    if (!entry) {
      // Not in the catalog at all — retired, or renamed under us. Nothing to
      // compare against, which is not the same as agreeing with us.
      closedNoCatalogEntry++
      continue
    }

    // HINTS: OpenRouter declares a repo for something we call closed. Only a
    // finding if the repo actually carries public weights — a declared but
    // empty or withdrawn repo agrees with us, it does not contradict us.
    if (entry.huggingFaceId) {
      const result = await safeVerify(entry.huggingFaceId)
      if (!result.confirmed && isTransportFailure(result.reason)) {
        closedUnreachable++
        continue
      }
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
    closedVerified++
    const phrase = describesOpenness(entry.description)
    if (phrase)
      contradicted.push(
        `${permaslug} [${origin}] — we say closed, but OpenRouter's ` +
          `description says "${phrase}"`
      )
  }

  log(
    `[classification-audit] ${openChecked} open (${unreachable} unverifiable), ` +
      `${closedChecked} closed (${closedVerified} verified, ` +
      `${closedNoCatalogEntry} not in catalog, ${closedUnreachable} unverifiable) ` +
      `(list ${OPEN_WEIGHT_LIST_VERSION})`
  )

  // ERROR, not warn, and that is a deployment fact rather than a severity
  // judgement: prod monitoring alerts on ERROR and does not look at WARN, so a
  // finding logged at warn is a finding nobody is ever told about — which
  // would leave this job detecting a wrong classification nightly and changing
  // nothing. If that routing changes, this can go back to warn.
  //
  // Kept rare enough to deserve it: transport failures are excluded above, so
  // these are claims about repos rather than about the network, and the first
  // three prod runs produced none.
  const indent = (lines: string[]) => '\n  ' + lines.join('\n  ')
  if (rot.length > 0)
    log.error(
      `[classification-audit] ${rot.length} open verdict(s) no longer verify:` +
        indent(rot)
    )
  if (contradicted.length > 0)
    log.error(
      `[classification-audit] ${contradicted.length} closed verdict(s) contradicted ` +
        `by OpenRouter metadata — review at /admin/model-classifications:` +
        indent(contradicted)
    )

  // A night where much of the population could not be reached proved little,
  // and "no disagreements" would read as a clean bill of health. Warn is right
  // here — it is a caveat on coverage, not a finding.
  const unverifiable = unreachable + closedUnreachable + closedNoCatalogEntry
  if (unverifiable > 0)
    log.warn(
      `[classification-audit] ${unverifiable} verdict(s) could not be re-checked ` +
        `(${unreachable} open unreachable, ${closedUnreachable} closed unreachable, ` +
        `${closedNoCatalogEntry} absent from catalog) — not counted as findings`
    )
  if (rot.length === 0 && contradicted.length === 0)
    log(
      `[classification-audit] no disagreements` +
        (unverifiable > 0 ? ` (${unverifiable} unverifiable)` : '')
    )
  return {
    rot,
    contradicted,
    openChecked,
    closedChecked,
    closedVerified,
    closedNoCatalogEntry,
    closedUnreachable,
    unreachable,
  }
}
