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
 * spaces, digits split from letters so `v4pro` and `v4-pro` agree, noise and
 * bare-number tokens dropped.
 *
 * Bare numbers go because dated permaslugs (`-20260813`) and repo date
 * suffixes (`-0813`) rarely agree on format, and a shared `2` or `70` says
 * nothing about identity. Version numbers survive attached to their letter
 * (`v4`, `k2`), which is where they actually discriminate.
 */
export const identifierTokens = (identifier: string): string[] => {
  const withoutOrg = identifier.includes('/')
    ? identifier.slice(identifier.indexOf('/') + 1)
    : identifier
  return withoutOrg
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1$2 ')
    .replace(/(\d)([a-z])/g, '$1 $2')
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
 * Minimum overlap for a PROPOSED repo to be accepted.
 *
 * 0.6 clears the real pairs seen so far (`deepseek-v4-pro-20260813` ->
 * `DeepSeek-V4-Pro-0813` scores 1.0; `nemotron-3.5-lightning-20260807` ->
 * `NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16` scores 1.0) while rejecting the
 * near-miss that motivates the guard (`solar-pro4` -> `Solar-Open2-250B`
 * scores 0.33).
 */
export const WEIGHTS_REPO_MATCH_THRESHOLD = 0.6

/**
 * Whether a proposed repo may back an `open` verdict for this model.
 *
 * Applies only to repos something GUESSED. A `hugging_face_id` the publisher
 * declared on their own model needs no name check — the publisher is the
 * authority on which repo is theirs, and their naming is occasionally
 * unguessable (`z-ai/glm-4.6` -> `zai-org/GLM-4.6`).
 */
export const proposedRepoMatchesModel = (
  permaslug: string,
  repo: string
): boolean =>
  weightsRepoNameOverlap(permaslug, repo) >= WEIGHTS_REPO_MATCH_THRESHOLD
