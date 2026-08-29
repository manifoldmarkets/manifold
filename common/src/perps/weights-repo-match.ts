// Does a HuggingFace repo plausibly hold THIS model's weights?
//
// The verifier in shared/huggingface answers "does this repo contain public
// weight files" — ground truth, and enough to auto-classify a model open when
// the publisher declared the repo themselves. It is NOT enough when something
// else proposed the repo, because it answers the wrong question: it confirms
// the repo has weights, not that the repo is *this model's* weights.
//
// That gap is exploitable by accident. Ask any search — a language model, a
// web search, a fuzzy match — where Upstage Solar Pro 4's weights live, and a
// plausible answer is `upstage/Solar-Open2-250B`: real, public, ungated, full
// of safetensors. It verifies perfectly. It is also a completely different
// model, and accepting it would mark a closed model open and move an
// executable index on a false positive.
//
// So a proposed repo must clear a second, deterministic bar: the repo name has
// to look like the model's name. This is a cheap guard, not a semantic one —
// it cannot know that Solar Open and Solar Pro are different product lines. It
// only knows that `solar-pro4` and `Solar-Open2-250B` share almost no
// distinctive tokens, while `deepseek-v4-pro-20260813` and
// `DeepSeek-V4-Pro-0813` share nearly all of them.

/**
 * Tokens that carry no identifying signal — they appear across unrelated
 * models and would inflate the overlap score for free.
 */
const NOISE_TOKENS = new Set([
  'ai',
  'base',
  'bf16',
  'chat',
  'fp8',
  'gguf',
  'instruct',
  'it',
  'labs',
  'model',
  'nvfp4',
  'preview',
  'v',
])

/**
 * Split an identifier into comparable tokens: lowercase, punctuation to
 * spaces, a break inserted after a letter-then-digit run so `v4pro` and
 * `v4-pro` agree, noise and bare-number tokens dropped.
 *
 * Bare numbers go because dated permaslugs (`-20260813`) and repo date
 * suffixes (`-0813`) rarely agree on format, and a shared `2` or `70` says
 * nothing about identity. Version numbers survive attached to their letter
 * (`v4`, `k2`), which is where they actually discriminate.
 *
 * Digit-then-letter is deliberately NOT split, and that is load-bearing rather
 * than incidental. Splitting it turned every parameter count into the bare
 * number (dropped as noise) plus a lone unit letter, so `480b` and `30b` both
 * reduced to `b` — and two different-sized members of one family became
 * token-identical. `qwen3-coder-480b-a35b` then scored a PERFECT 1.00 against
 * `Qwen3-Coder-30B-A3B`, a real, public, weight-bearing repo for a different
 * model. Size is often the only thing distinguishing siblings, so it has to
 * survive tokenization: `480b` and `30b` stay whole and no longer match.
 */
export const identifierTokens = (identifier: string): string[] => {
  const withoutOrg = identifier.includes('/')
    ? identifier.slice(identifier.indexOf('/') + 1)
    : identifier
  return withoutOrg
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1$2 ')
    .split(/[^a-z0-9.]+/)
    .map((token) => token.replace(/^[.]+|[.]+$/g, ''))
    .filter(
      (token) =>
        token.length > 0 && !NOISE_TOKENS.has(token) && !/^\d+$/.test(token)
    )
}

/**
 * Fraction of the MODEL's distinctive tokens that appear in the repo name.
 *
 * Deliberately asymmetric — measured over the model's tokens, not the union.
 * A weights repo routinely carries extra tokens the permaslug omits (size,
 * precision, a base/instruct split), and penalising those would reject correct
 * repos. What must not happen is the reverse: the model naming something the
 * repo has no sign of.
 */
export const weightsRepoNameOverlap = (
  permaslug: string,
  repo: string
): number => {
  const modelTokens = identifierTokens(permaslug)
  if (modelTokens.length === 0) return 0
  const repoTokens = new Set(identifierTokens(repo))
  const matched = modelTokens.filter((token) => repoTokens.has(token))
  return matched.length / modelTokens.length
}

/**
 * Minimum overlap for a PROPOSED repo to be accepted: FULL coverage. Every
 * distinctive token in the model's name must appear in the repo's.
 *
 * A partial threshold cannot separate a sibling from a match, because it is
 * exactly the missing token that names the difference. At 0.6, every one of
 * these cleared the bar against a real, public, weight-bearing repo for a
 * DIFFERENT model:
 *
 *   deepseek-v4-pro       -> DeepSeek-V4-Flash-0731        0.67
 *   deepseek-v4-flash     -> DeepSeek-V4-Pro-0813          0.67
 *   nemotron-3.5-lightning-> NVIDIA-Nemotron-3.5-Ultra     0.67
 *   qwen3-coder-480b-a35b -> Qwen3-Coder-30B-A3B-Instruct  0.60
 *
 * The shared tokens carry the family; the dropped one carries the identity.
 * `pro` vs `flash` IS the model. Live HuggingFace verification cannot catch
 * any of these, because the repo it re-fetches is genuinely public and
 * genuinely full of weights — it is simply the wrong model's.
 *
 * Full coverage costs nothing on real data: every correct pair observed scores
 * exactly 1.00, because a weights repo names its model and then ADDS to it.
 * The asymmetry that makes extra repo tokens free (size, precision, an
 * instruct/base split) is what lets a strict bar stay strict without
 * rejecting correct repos.
 */
export const WEIGHTS_REPO_MATCH_THRESHOLD = 1

/**
 * Minimum number of distinctive tokens the MODEL name must contribute before a
 * ratio over it means anything.
 *
 * A ratio alone is not enough, because the denominator can be 1. Bare integers
 * are dropped as noise (see identifierTokens), so `x-ai/grok-5-20260901`
 * reduces to exactly `["grok"]` — and then ANY repo containing "grok" scores a
 * perfect 1.00. `xai-org/grok-1` is real, public, and full of weight files, so
 * it clears verification too, and a closed frontier model would land on the
 * open side of an executable index with both guards satisfied.
 *
 * This is not a hypothetical shape: 10 of the 243 audited seed permaslugs
 * reduce to one token, including `openai/gpt-5-2025-08-07`,
 * `x-ai/grok-4-07-09`, and `z-ai/glm-5-20260211` — the highest-traffic closed
 * models on the index, and precisely the family names a successor release
 * would reuse. Those specific slugs are safe today only because the seed list
 * already classifies them and overrides on seeded models are refused; the
 * exposure is the NEXT one, which is what this agent exists to catch.
 *
 * Two tokens is the smallest bar that makes the ratio load-bearing: a
 * single-token model can no longer be matched by family name alone, and every
 * real pair observed so far contributes three or more.
 */
export const MIN_DISTINCTIVE_MODEL_TOKENS = 2

/**
 * Whether a proposed repo is worth SHOWING an operator as this model's weights.
 *
 * Read the verb carefully: this gates a recommendation, not a classification.
 * Nothing downstream auto-applies an agent-proposed repo — that decision needs
 * a human, because verification plus a name match still cannot establish that
 * a repo IS this model's, and this guard has been wrong twice on repos that
 * verified cleanly. Its job is to keep obvious mismatches out of the review
 * queue so the queue stays quick to work through; the index's correctness does
 * not rest on it.
 *
 * Applies only to repos something GUESSED. A `hugging_face_id` the publisher
 * declared on their own model needs no name check and IS auto-applied on
 * verification — the publisher is the authority on which repo is theirs, so
 * there is no identity inference to get wrong, and their naming is occasionally
 * unguessable (`z-ai/glm-4.6` -> `zai-org/GLM-4.6`).
 *
 * Returns false when the model name is too generic to discriminate at all,
 * which surfaces as "could not determine" rather than a verdict of closed.
 */
export const proposedRepoMatchesModel = (
  permaslug: string,
  repo: string
): boolean =>
  identifierTokens(permaslug).length >= MIN_DISTINCTIVE_MODEL_TOKENS &&
  weightsRepoNameOverlap(permaslug, repo) >= WEIGHTS_REPO_MATCH_THRESHOLD

/**
 * Publisher -> the HuggingFace org(s) they actually publish weights under.
 *
 * An explicit map rather than a prefix rule, and that is the whole point.
 * Prefix matching looks like it captures the pattern -- `z-ai` publishes as
 * `zai-org`, `cohere` as `CohereLabs` -- but "org name starts with the
 * publisher's name" is a namespace ANYONE can enter. HuggingFace org names
 * are first-come, so `openai-community` already satisfied it for every
 * `openai/*` model, and `anthropic-fan` or `qwenfake` would too. That is the
 * same first-come name-grab the fabricated `brokenshards/ox-alpha` repo
 * exploited, one level up.
 *
 * Comparison is case-insensitive but otherwise EXACT -- punctuation is
 * significant. An earlier version normalised it away, which made `openai`
 * and `open-ai` the same namespace; `open-ai` is a real, currently-empty org
 * on HuggingFace, so anyone claiming it would have inherited every
 * `openai/*` model. Hyphens are part of an org's identity, not noise.
 *
 * Measured against the 175 open classifications carrying a weights repo: 86
 * match their publisher's org exactly and the rest need one of the entries
 * below. `venice` is deliberately ABSENT -- its weights genuinely ship from
 * `cognitivecomputations`, and a cross-publisher release is exactly the case
 * that should reach a human rather than be waved through by a map entry.
 */
const PUBLISHER_HF_ORGS: Record<string, string[]> = {
  'ai21': ['ai21labs'],
  'bytedance': ['bytedance-seed'],
  'cohere': ['coherelabs', 'cohereforai'],
  'deepseek': ['deepseek-ai'],
  'liquid': ['liquidai'],
  'meituan': ['meituan-longcat'],
  'meta': ['meta-models', 'meta-llama'],
  'minimax': ['minimaxai'],
  'perplexity': ['perplexity-ai'],
  'stepfun': ['stepfun-ai'],
  'x-ai': ['xai-org'],
  'xiaomi': ['xiaomimimo'],
  'z-ai': ['zai-org'],
}

/**
 * Is `repo` owned by the model's own publisher?
 *
 * The name check above asks whether a repo is named like the model. That is
 * necessary and not sufficient, because a name is not owned by anyone: on
 * 2026-08-21 someone created `brokenshards/ox-alpha` -- twenty files named
 * like weight shards, a config claiming 800B parameters, a README reading
 * "real ox alpha dataset npnp", the whole repo assembled in 24 seconds --
 * while `stealth/ox-alpha` was climbing into the ranked window. It is public,
 * carries `.safetensors` files, and scores a perfect 1.00 name match. Both
 * other guards pass it.
 *
 * What it cannot fake is provenance. Weights for a model are published by the
 * outfit that trained it, so a repo under an unrelated account is not that
 * model's weights however it is named. The same rule independently rejects
 * the plausible-but-wrong matches a broad search returns --
 * `jondurbin/airoboros-gpt-3.5-turbo-100k-7b` for `openai/gpt-3.5-turbo`, a
 * stranger's INT4 quant for `~z-ai/glm-latest`.
 *
 * A false result must NOT be read as "closed". This gates whether a repo may
 * be RECOMMENDED automatically; a failure sends the model to a human rather
 * than deciding against it.
 */
export const repoOwnerMatchesPublisher = (
  permaslug: string,
  repo: string
): boolean => {
  // `~` prefixes OpenRouter's floating aliases (`~z-ai/glm-latest`) and is not
  // part of the publisher's name.
  const publisher = (permaslug.replace(/^~/, '').split('/')[0] ?? '').toLowerCase()
  const owner = (repo.split('/')[0] ?? '').toLowerCase()
  if (!publisher || !owner) return false
  if (owner === publisher) return true
  return (PUBLISHER_HF_ORGS[publisher] ?? []).includes(owner)
}
