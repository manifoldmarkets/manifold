import { DAY_MS } from '../util/time'

// The open-weight share index: what fraction of the tokens routed through
// OpenRouter's top-50 models went to models whose weights the public can
// download.
//
// This file is the published methodology, not an implementation detail — a
// settlement source nobody can inspect is a settlement source people dispute.
// It lives in `common` (a leaf package) so the list the oracle scores against
// is one auditable artifact, and so a UI that wants to surface it later can
// read it directly rather than keeping a copy that drifts.
//
// THE TEST: are the weights downloadable by the public?
//   downloadable -> open.  API-only -> closed.
// Deliberately NOT "open source": that invites license-purity arguments
// (Llama's licence isn't OSI-approved but the weights are right there).
// Downloadability is binary and anyone can check it in thirty seconds, which
// is the bar a settlement source has to clear.
//
// Pre-committed edge cases, so they're never adjudicated mid-market:
//   - Weights released AFTER launch -> reclassify from the release date
//     forward, never retroactively. Retroactive edits rewrite settled history.
//   - A click-through licence is still public. Llama and Gemma are marked
//     `gated` on HuggingFace, but any member of the public can accept the
//     terms and download; the weights are in general circulation. Research-
//     only or discretionary approval is NOT public, and neither is a private
//     repo. The line is "can anyone get them", not "is the licence tidy".
//   - Cloaked/stealth models (OpenRouter's `*-alpha` slugs) are closed: you
//     cannot download weights for an anonymous model. If one is later
//     unmasked as an open model, that reclassifies forward, not backward.
//   - A model missing from this list -> excluded from BOTH numerator and
//     denominator, and alerted on. Never defaulted to a side: a mis-defaulted
//     frontier launch would move the index several points overnight for no
//     real reason.
//   - An unclassified model does NOT halt the index outright while it is
//     small. Halting on any unknown treats a model with 0.1% of tokens the
//     same as one with 15%, and in practice that meant a live market marking
//     against a hours-stale oracle — and charging funding against it — every
//     time a new model cracked the top 50. The rule instead bounds the error
//     it can cause: see UNCLASSIFIED_TOKEN_SHARE_CAP. Above the cap, or once
//     an unknown has gone unclassified for longer than the operator's grace
//     window, the index halts as before. Exclusion is never silent — every
//     grace publication names the excluded models.
//
// The list covers every model that entered OpenRouter's top 50 in the year to
// the version date, not just today's top 50, because the backfilled chart is
// scored with it too — membership churns, and an unclassified model silently
// shrinks the denominator of a historical point.
//
// Every `weights` value was verified against the HuggingFace API on the list
// version date: the repo resolves, is not private, and carries actual weight
// files. OpenRouter's `/models` endpoint exposes a `hugging_face_id` that
// supplies most of them, but it is NOT authoritative and cannot be used as
// the classification source: at v2026-07-27 it was absent for models whose
// weights are demonstrably public (Ling-2.6-flash, Qwen3-Embedding-8B,
// pplx-embed-v1, MiMo-V2-Flash, Trinity-Large-Preview, the TNG Chimera
// merges), and several ranked models don't appear in `/models` at all. Hence
// a versioned list rather than a live lookup: the index definition must not
// change silently when a third party edits a metadata field.

// MISSED_BY_RENAME — the failure mode a re-audit on 2026-08-24 actually found.
//
// A full re-verification of all 299 published classifications turned up zero
// rot (every `open` entry still cites a live public repo with weight files)
// but four models marked closed whose weights were public all along:
// Kimi K3, Mistral Large 3 2512, Mistral Medium 3.5, Ling-3.0-flash.
//
// Three of the four have an EMPTY `hugging_face_id` on OpenRouter, so building
// the list fell through to the org-catalogue name match — and that match
// cannot bridge a rename. `mistral-large-2512` and
// `Mistral-Large-3-675B-Base-2512` share almost no tokens, so a correct repo
// sitting in the publisher's own org scored zero and the model defaulted to
// closed. Mistral renames between OpenRouter slug and HF repo routinely, which
// is why it is two of the four.
//
// Every error ran the same direction — open marked closed — so the published
// index was UNDERSTATED, never inflated. That is not luck: a missing repo is
// the only way the build can fail, and its default is closed.
//
// The fix is not a better matcher. It is that nothing ever re-examined a
// verdict once written: no job re-verified an existing entry and none diffed
// against OpenRouter's own metadata, so a wrong entry was permanent. See
// `update-classification-audit.ts`, which now asserts both nightly.

/** Bump when the map changes. */
export const OPEN_WEIGHT_LIST_VERSION = '2026-08-24'

/** Trailing window, in whole UTC days, that the index averages over. */
export const OPEN_WEIGHT_WINDOW_DAYS = 7

/**
 * How much of the classified token pool may sit in unclassified models before
 * the index refuses to publish, as a fraction U/C (unclassified tokens over
 * classified tokens).
 *
 * The bound this buys, exactly. With p the reported share (as a fraction), C
 * classified tokens, U unclassified, and w = U/C, the true share lies in
 *
 *     [ p/(1+w) , (p + w)/(1 + w) ]
 *
 * — the low end if every unclassified token is closed, the high end if every
 * one is open. So the worst-case error is w * max(p, 1-p) / (1 + w), i.e.
 * strictly under w. At this cap and an index near 70%, publishing with an
 * unknown excluded is off by at most ~0.7 percentage points, and only until
 * the model is classified.
 *
 * That is the trade being made: a bounded sub-point error for a few hours,
 * versus halting the feed and leaving a live market marking (and funding)
 * against an oracle that is hours stale and unbounded in error. The stale
 * oracle is strictly worse, which is why the cap exists at all.
 *
 * NEEDS CALIBRATION against real rankings data — a model entering at #50
 * displaces the previous #50, so the realistic entry share sets how often the
 * grace path actually saves a freeze. Tune from `unclassifiedShareOfClassified`
 * on published points before trusting this number.
 */
export const UNCLASSIFIED_TOKEN_SHARE_CAP = 0.01

/**
 * How much of the classified token pool may sit in router/alias slugs before
 * the index refuses to publish, as composite tokens over classified tokens.
 *
 * These are excluded from both sides by design (see isCompositeSlug), and
 * unlike an unclassified model nothing else bounds them — no grace clock, no
 * adjudication, no alert. Without a cap a router that grew into real volume
 * would quietly shrink the denominator forever and the published number would
 * stop describing the population the methodology names.
 *
 * NEEDS CALIBRATION, like UNCLASSIFIED_TOKEN_SHARE_CAP. No router or alias has
 * ever entered the ranked window, so there is no measured base rate to size
 * this against; 2% is chosen only as "clearly past a rounding decision" and
 * should be revisited the first time `compositeSlugs` is non-empty on a real
 * tick. It is deliberately looser than the unclassified cap because exclusion
 * here is the CORRECT treatment rather than a temporary gap awaiting a human.
 */
export const COMPOSITE_TOKEN_SHARE_CAP = 0.02

/**
 * How long a below-cap unknown may keep publishing before the index halts on
 * it anyway, measured from when the catalog watcher first saw the model.
 *
 * The cap bounds how wrong a single publication can be; this bounds how long
 * we are willing to be wrong at all. Without it a model that never gets
 * adjudicated would sit excluded from the denominator forever, and the index
 * would quietly stop meaning what the methodology says it means.
 *
 * Two days: the watcher runs nightly, so this is roughly two chances to notice
 * plus a weekend's slack, and still far short of the multi-day drift that
 * would make the published definition a fiction.
 */
export const UNCLASSIFIED_GRACE_WINDOW_MS = 2 * DAY_MS

/**
 * OpenRouter aggregates everything outside the top 50 into a single row under
 * this key. It cannot be classified, so it is excluded from the denominator —
 * the index is defined over the top 50, and the market description must say
 * so. We do not estimate it.
 */
export const OTHER_MODEL_KEY = 'other'

/**
 * OpenRouter slugs that route across models instead of being one.
 *
 * `openrouter/fusion` is the clearest: OpenRouter documents it as "a panel of
 * expert models … analyzes your prompt in parallel, then a judge model
 * synthesizes their responses", billed as the sum of the underlying
 * completions. Its tokens are a MIXTURE of open and closed models, so `open`
 * and `closed` are both false statements about it and either one misattributes
 * the whole volume.
 *
 * An explicit list rather than a pattern, because `openrouter/` is also where
 * the cloaked pre-release models live and those ARE single models, correctly
 * classified closed — you cannot download weights for a model nobody has
 * named. No suffix separates the two: `auto-beta` is a router and
 * `horizon-beta` is a stealth model.
 */
export const ROUTER_MODEL_KEYS = [
  'openrouter/auto',
  'openrouter/auto-beta',
  'openrouter/bodybuilder',
  'openrouter/free',
  'openrouter/fusion',
  'openrouter/pareto-code',
]

/**
 * Slugs that are not a single model and so cannot carry a classification.
 *
 * Two shapes. Routers, above. And OpenRouter's floating aliases, which carry a
 * `~` prefix (`~z-ai/glm-latest`, `~openai/gpt-latest`) and resolve to whatever
 * the publisher's current model is — so their openness changes underneath any
 * stored answer. `~z-ai/glm-latest` points at GLM 5.3 today, which is closed,
 * while every earlier GLM is open; a boolean written against the alias would
 * have been right last month and wrong now, with nothing to notice.
 *
 * Excluded from BOTH sides, exactly as `other` is, rather than left
 * unclassified. Unclassified is the worse failure: it starts a grace clock and
 * eventually halts the feed, forcing someone to invent a boolean for a thing
 * that does not have one, under a deadline. Their tokens are accounted for and
 * logged by the caller so the exclusion can never become a silent drop — see
 * `compositeTokens`.
 *
 * If an alias ever carries enough volume to matter, the fix is to resolve it
 * through OpenRouter's own `alias_target` field to the model it points at and
 * classify THAT, not to guess at the alias.
 */
export const isCompositeSlug = (permaslug: string): boolean =>
  permaslug.startsWith('~') ||
  ROUTER_MODEL_KEYS.includes(basePermaslug(permaslug))

export type ModelClassification = {
  /** True iff the weights are publicly downloadable. */
  open: boolean
  /** Public weights repo — the evidence backing an `open` call. */
  weights?: string
}

/**
 * A resolved classification map. The constant below is the audited seed; the
 * backend layers operator/auto-classifier overrides from the database on top
 * and passes the merged map in, so a classification can land without a deploy.
 * Every consumer takes the map as an argument for exactly that reason — the
 * module-level default keeps pure callers (tests, the methodology UI) honest.
 */
export type ModelClassifications = Record<string, ModelClassification>

/**
 * Keyed on the BASE permaslug. OpenRouter bills the same weights under
 * variant suffixes (`...:free`), which are the same model for index purposes.
 */
export const OPEN_WEIGHT_MODELS: Record<string, ModelClassification> = {
  // Added 2026-08-14: both entered the top 50 with OpenRouter's 2026-08-13 day
  // and froze the feed together.
  //
  // V4 Pro 0813 is a new dated release, NOT the 20260423 entry below — DeepSeek
  // ships each one as its own permaslug and each needs its own verdict.
  // deepseek-ai/DeepSeek-V4-Pro-0813 is public and ungated with 66 safetensors
  // shards, and third-party quants (unsloth/DeepSeek-V4-Pro-0813-GGUF) are
  // already up, which nobody could produce without the weights in hand
  // (verified 2026-08-14).
  'deepseek/deepseek-v4-pro-20260813': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V4-Pro-0813',
  }, // DeepSeek: DeepSeek V4 Pro 0813
  // Grok 4.6 is API-only, consistent with every other xAI model here. No
  // grok-4.6 repo exists in any org; the xai-org account holds only grok-1 and
  // grok-2, the two generations they open-sourced after retiring them, and
  // OpenRouter reports hugging_face_id: null (verified 2026-08-14). Note
  // OpenRouter now labels the publisher "SpaceXAI" — a vendor rename, not a
  // licensing change. If a Grok 4.6 release follows the grok-1/grok-2 pattern
  // later, that counts from the release date forward via a new entry.
  'x-ai/grok-4.6-20260810': { open: false }, // SpaceXAI: Grok 4.6
  // Added 2026-08-13: entered the top 50 with OpenRouter's 2026-08-12 day and
  // froze the feed (fail-closed). Solar Pro 4 is API-only. No `solar-pro4`
  // repo exists anywhere on HuggingFace (global search, 0 hits), and the whole
  // `solar-pro*` line publishes tokenizer-only repos — `solar-pro2-tokenizer`
  // and `solar-pro3-tokenizer` resolve, `upstage/solar-pro3` itself does not.
  // Upstage's downloadable weights ship under the separately branded Solar
  // Open line (`upstage/Solar-Open-100B`, `upstage/Solar-Open2-250B`), which
  // is not what OpenRouter is serving here; their `/models` entry for this
  // permaslug carries `hugging_face_id: null` (verified 2026-08-13). If
  // Upstage later publishes the weights, that counts from the release date
  // forward via a new entry — never retroactively.
  'upstage/solar-pro4-20260810': { open: false }, // Upstage: Solar Pro 4
  // Added 2026-08-07: entered the top 50 and froze the feed (fail-closed).
  // Muse Spark is Meta's first CLOSED-weights family — API-only via
  // api.meta.ai, no repo in meta-llama/facebook HF orgs, widely reported as
  // Meta's break from open-weights (verified 2026-08-07). Muse Spark 1.2
  // (OpenRouter-listed 2026-08-05) and Muse Code are closed on the same
  // evidence; add their exact permaslugs when the fail-closed alert names
  // them. If Meta later opens the weights, new entries count from that
  // release forward only — never reclassify retroactively.
  'meta/muse-spark-1.1-20260709': { open: false }, // Meta: Muse Spark 1.1
  // Added 2026-08-12: entered the top 50 (as the :free variant) and froze the
  // feed. Public BF16 + NVFP4 repos with full safetensors in the nvidia HF
  // org, ungated (verified 2026-08-12).
  'nvidia/nemotron-3.5-lightning-20260807': {
    open: true,
    weights: 'nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16',
  }, // NVIDIA: Nemotron 3.5 Lightning
  // Added 2026-08-05: these four entered the top 50 during the week of
  // 2026-07-29 and froze the feed (fail-closed on unclassified models, as
  // designed — see the header comment).
  'deepseek/deepseek-v4-flash-20260731': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V4-Flash-0731',
  }, // DeepSeek: DeepSeek V4 Flash 0731 (production re-release, MIT)
  'openai/gpt-5.6-luna-pro-20260709': { open: false }, // OpenAI: GPT-5.6 Luna Pro
  'qwen/qwen3.7-flash-20260727': { open: false }, // Qwen: Qwen3.7 Flash (API-only, no weights)
  // Alibaba ANNOUNCED weights for the week of 2026-08-10, but nothing is on
  // HuggingFace as of the version date. Classify by published weight files,
  // never announcements; reclassify + bump the version if/when they land.
  'qwen/qwen3.8-max-20260803': { open: false }, // Qwen: Qwen3.8 Max
  'deepseek/deepseek-v4-flash-20260423': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V4-Flash',
  }, // DeepSeek: DeepSeek V4 Flash
  'xiaomi/mimo-v2.5-20260422': { open: true, weights: 'XiaomiMiMo/MiMo-V2.5' }, // Xiaomi: MiMo-V2.5
  'tencent/hy3-preview-20260421': {
    open: true,
    weights: 'tencent/Hy3-preview',
  }, // Tencent: Hy3 preview
  'anthropic/claude-4.6-sonnet-20260217': { open: false }, // Anthropic: Claude Sonnet 4.6
  'minimax/minimax-m3-20260531': {
    open: true,
    weights: 'MiniMaxAI/Minimax-M3',
  }, // MiniMax: MiniMax M3
  'google/gemini-3-flash-preview-20251217': { open: false }, // Google: Gemini 3 Flash Preview
  'anthropic/claude-4.7-opus-20260416': { open: false }, // Anthropic: Claude Opus 4.7
  'deepseek/deepseek-v3.2-20251201': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3.2',
  }, // DeepSeek: DeepSeek V3.2
  'deepseek/deepseek-v4-pro-20260423': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V4-Pro',
  }, // DeepSeek: DeepSeek V4 Pro
  'google/gemini-2.5-flash': { open: false }, // Google: Gemini 2.5 Flash
  'tencent/hy3-20260706': { open: true, weights: 'tencent/Hy3' }, // Tencent: Hy3
  'x-ai/grok-code-fast-1': { open: false },
  'google/gemini-2.5-flash-lite': { open: false }, // Google: Gemini 2.5 Flash Lite
  'minimax/minimax-m2.5-20260211': {
    open: true,
    weights: 'MiniMaxAI/MiniMax-M2.5',
  }, // MiniMax: MiniMax M2.5
  'z-ai/glm-5.2-20260616': { open: true, weights: 'zai-org/GLM-5.2' }, // Z.ai: GLM 5.2
  'anthropic/claude-4.5-sonnet-20250929': { open: false }, // Anthropic: Claude Sonnet 4.5
  'openrouter/owl-alpha': { open: false },
  'openai/gpt-oss-120b': { open: true, weights: 'openai/gpt-oss-120b' }, // OpenAI: gpt-oss-120b
  'anthropic/claude-4.6-opus-20260205': { open: false }, // Anthropic: Claude Opus 4.6
  'anthropic/claude-4.8-opus-20260528': { open: false }, // Anthropic: Claude Opus 4.8
  'x-ai/grok-4.1-fast': { open: false },
  'stepfun/step-3.5-flash': {
    open: true,
    weights: 'stepfun-ai/Step-3.5-Flash',
  }, // StepFun: Step 3.5 Flash
  'moonshotai/kimi-k2.5-0127': { open: true, weights: 'moonshotai/Kimi-K2.5' }, // MoonshotAI: Kimi K2.5
  'nvidia/nemotron-3-ultra-550b-a55b-20260604': {
    open: true,
    weights: 'nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16',
  }, // NVIDIA: Nemotron 3 Ultra (free)
  'xiaomi/mimo-v2-pro-20260318': { open: false },
  'minimax/minimax-m2.7-20260318': {
    open: true,
    weights: 'MiniMaxAI/MiniMax-M2.7',
  }, // MiniMax: MiniMax M2.7
  'moonshotai/kimi-k2.6-20260420': {
    open: true,
    weights: 'moonshotai/Kimi-K2.6',
  }, // MoonshotAI: Kimi K2.6
  'nvidia/nemotron-3-super-120b-a12b-20230311': {
    open: true,
    weights: 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8',
  }, // NVIDIA: Nemotron 3 Super (free)
  'stepfun/step-3.7-flash-20260528': {
    open: true,
    weights: 'stepfun-ai/Step-3.7-Flash',
  }, // StepFun: Step 3.7 Flash
  'openai/gpt-4o-mini': { open: false }, // OpenAI: GPT-4o-mini
  'qwen/qwen3.6-plus-04-02': { open: false }, // Qwen: Qwen3.6 Plus
  'openai/gpt-5.5-20260423': { open: false }, // OpenAI: GPT-5.5
  'anthropic/claude-4-sonnet-20250522': { open: false }, // Anthropic: Claude Sonnet 4
  'anthropic/claude-4.5-haiku-20251001': { open: false }, // Anthropic: Claude Haiku 4.5
  'google/gemini-2.0-flash-001': { open: false },
  'openai/gpt-5.4-20260305': { open: false }, // OpenAI: GPT-5.4
  'z-ai/glm-5-20260211': { open: true, weights: 'zai-org/GLM-5' }, // Z.ai: GLM 5
  'xiaomi/mimo-v2.5-pro-20260422': {
    open: true,
    weights: 'XiaomiMiMo/MiMo-V2.5-Pro',
  }, // Xiaomi: MiMo-V2.5-Pro
  'google/gemini-3.1-pro-preview-20260219': { open: false }, // Google: Gemini 3.1 Pro Preview
  'x-ai/grok-4-fast': { open: false },
  'poolside/laguna-m.1-20260312': {
    open: true,
    weights: 'poolside/Laguna-M.1',
  }, // Poolside: Laguna M.1 (free)
  'google/gemini-2.5-pro': { open: false }, // Google: Gemini 2.5 Pro
  'deepseek/deepseek-chat-v3-0324': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3-0324',
  }, // DeepSeek: DeepSeek V3 0324
  'z-ai/glm-5.1-20260406': { open: true, weights: 'zai-org/GLM-5.1' }, // Z.ai: GLM 5.1
  'mistralai/mistral-nemo': {
    open: true,
    weights: 'mistralai/Mistral-Nemo-Instruct-2407',
  }, // Mistral: Mistral Nemo
  'openai/gpt-5-mini-2025-08-07': { open: false }, // OpenAI: GPT-5 Mini
  'xiaomi/mimo-v2-flash-20251210': {
    open: true,
    weights: 'XiaomiMiMo/MiMo-V2-Flash',
  },
  'google/gemini-3.1-flash-lite-preview-20260303': { open: false }, // Google: Gemini 3.1 Flash Lite Preview
  'google/gemini-3.1-flash-lite-20260507': { open: false }, // Google: Gemini 3.1 Flash Lite
  'anthropic/claude-4.5-opus-20251124': { open: false }, // Anthropic: Claude Opus 4.5
  'google/gemini-3.5-flash-20260519': { open: false }, // Google: Gemini 3.5 Flash
  'qwen/qwen3-235b-a22b-07-25': {
    open: true,
    weights: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
  }, // Qwen: Qwen3 235B A22B Instruct 2507
  'z-ai/glm-5-turbo-20260315': { open: false }, // Z.ai: GLM 5 Turbo
  'arcee-ai/trinity-large-preview': {
    open: true,
    weights: 'arcee-ai/Trinity-Large-Preview',
  },
  'google/gemma-4-26b-a4b-it-20260403': {
    open: true,
    weights: 'google/gemma-4-26B-A4B-it',
  }, // Google: Gemma 4 26B A4B  (free)
  'google/gemma-4-31b-it-20260402': {
    open: true,
    weights: 'google/gemma-4-31B-it',
  }, // Google: Gemma 4 31B (free)
  'deepseek/deepseek-chat-v3.1': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3.1',
  }, // DeepSeek: DeepSeek V3.1
  'anthropic/claude-sonnet-5-20260630': { open: false }, // Anthropic: Claude Sonnet 5
  'openai/gpt-4.1-mini-2025-04-14': { open: false }, // OpenAI: GPT-4.1 Mini
  'openai/gpt-5-nano-2025-08-07': { open: false }, // OpenAI: GPT-5 Nano
  'openai/gpt-5.4-mini-20260317': { open: false }, // OpenAI: GPT-5.4 Mini
  'z-ai/glm-4.7-20251222': { open: true, weights: 'zai-org/GLM-4.7' }, // Z.ai: GLM 4.7
  'z-ai/glm-4.5-air': { open: true, weights: 'zai-org/GLM-4.5-Air' }, // Z.ai: GLM 4.5 Air
  'google/gemini-3-pro-preview-20251117': { open: false },
  'qwen/qwen3-coder-480b-a35b-07-25': {
    open: true,
    weights: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  }, // Qwen: Qwen3 Coder 480B A35B
  'minimax/minimax-m2.1': { open: true, weights: 'MiniMaxAI/MiniMax-M2.1' }, // MiniMax: MiniMax M2.1
  'openai/gpt-5.2-20251211': { open: false }, // OpenAI: GPT-5.2
  'openai/gpt-oss-20b': { open: true, weights: 'openai/gpt-oss-20b' }, // OpenAI: gpt-oss-20b (free)
  'openai/gpt-5.3-codex-20260224': { open: false }, // OpenAI: GPT-5.3-Codex
  'openai/gpt-5.4-nano-20260317': { open: false }, // OpenAI: GPT-5.4 Nano
  'minimax/minimax-m2': { open: true, weights: 'MiniMaxAI/MiniMax-M2' }, // MiniMax: MiniMax M2
  'tngtech/deepseek-r1t2-chimera': {
    open: true,
    weights: 'tngtech/DeepSeek-TNG-R1T2-Chimera',
  },
  'openai/gpt-5-2025-08-07': { open: false }, // OpenAI: GPT-5
  'qwen/qwen3.6-plus-preview': { open: false },
  'anthropic/claude-3-7-sonnet-20250219': { open: false },
  'qwen/qwen3-embedding-8b': { open: true, weights: 'Qwen/Qwen3-Embedding-8B' },
  // Corrected 2026-08-24 (was `open: false`). OpenRouter's own description
  // calls it "a 2.8T parameter open-weight multimodal reasoning model" and
  // declares this repo; it is public, ungated, 96 weight files, 2.7M
  // downloads, and predates the 2026-08-14 list cut by two months. The
  // original miss is the rename pattern documented at MISSED_BY_RENAME below.
  'moonshotai/kimi-k3-20260715': {
    open: true,
    weights: 'moonshotai/Kimi-K3',
  }, // MoonshotAI: Kimi K3
  'google/gemini-2.5-flash-lite-preview-09-2025': { open: false },
  'anthropic/claude-5-fable-20260609': { open: false }, // Anthropic: Claude Fable 5
  'openrouter/hunter-alpha': { open: false },
  'qwen/qwen3.7-max-20260520': { open: false }, // Qwen: Qwen3.7 Max
  'z-ai/glm-4.6': { open: true, weights: 'zai-org/GLM-4.6' }, // Z.ai: GLM 4.6
  'meta-llama/llama-3.1-8b-instruct': {
    open: true,
    weights: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
  }, // Meta: Llama 3.1 8B Instruct
  'qwen/qwen3.5-flash-20260224': { open: false }, // Qwen: Qwen3.5-Flash
  'openai/gpt-4.1-2025-04-14': { open: false }, // OpenAI: GPT-4.1
  'xiaomi/mimo-v2-omni-20260318': { open: false },
  'openai/gpt-5.6-sol-20260709': { open: false }, // OpenAI: GPT-5.6 Sol
  'deepseek/deepseek-r1-0528': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-R1-0528',
  }, // DeepSeek: R1 0528
  'x-ai/grok-4.5-20260708': { open: false }, // xAI: Grok 4.5
  'nex-agi/nex-n2-pro': { open: true, weights: 'nex-agi/Nex-N2-Pro' }, // Nex AGI: Nex-N2-Pro
  'moonshotai/kimi-k2.7-code-20260612': {
    open: true,
    weights: 'moonshotai/Kimi-K2.7-Code',
  }, // MoonshotAI: Kimi K2.7 Code
  'inclusionai/ling-2.6-1t-20260423': {
    open: true,
    weights: 'inclusionAI/Ling-2.6-1T',
  }, // inclusionAI: Ling-2.6-1T
  'qwen/qwen3.5-397b-a17b-20260216': {
    open: true,
    weights: 'Qwen/Qwen3.5-397B-A17B',
  }, // Qwen: Qwen3.5 397B A17B
  'openai/text-embedding-3-small': { open: false },
  'google/gemini-2.5-flash-preview-09-2025': { open: false },
  'qwen/qwen3.7-plus-20260602': { open: false }, // Qwen: Qwen3.7 Plus
  'mistralai/devstral-2512': {
    open: true,
    weights: 'mistralai/Devstral-2-123B-Instruct-2512',
  }, // Mistral: Devstral 2 2512
  'google/gemini-2.0-flash-lite-001': { open: false },
  'meta-llama/llama-3.3-70b-instruct': {
    open: true,
    weights: 'meta-llama/Llama-3.3-70B-Instruct',
  }, // Meta: Llama 3.3 70B Instruct
  'openrouter/elephant-alpha': { open: false },
  'kwaipilot/kat-coder-pro-v1': { open: false },
  'openai/gpt-5.6-luna-20260709': { open: false }, // OpenAI: GPT-5.6 Luna
  'deepseek/deepseek-v3.2-exp': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3.2-Exp',
  }, // DeepSeek: DeepSeek V3.2 Exp
  'cohere/north-mini-code-20260617': {
    open: true,
    weights: 'CohereLabs/North-Mini-Code-1.0',
  }, // Cohere: North Mini Code (free)
  'google/gemma-3-27b-it': { open: true, weights: 'google/gemma-3-27b-it' }, // Google: Gemma 3 27B
  'openai/gpt-5.1-20251113': { open: false }, // OpenAI: GPT-5.1
  'google/gemma-3-12b-it': { open: true, weights: 'google/gemma-3-12b-it' }, // Google: Gemma 3 12B
  'inclusionai/ring-2.6-1t-20260508': {
    open: true,
    weights: 'inclusionAI/Ring-2.6-1T',
  }, // inclusionAI: Ring-2.6-1T
  'z-ai/glm-4.5': { open: true, weights: 'zai-org/GLM-4.5' }, // Z.ai: GLM 4.5
  'qwen/qwen3-30b-a3b-04-28': { open: true, weights: 'Qwen/Qwen3-30B-A3B' }, // Qwen: Qwen3 30B A3B
  'meta-llama/llama-4-maverick-17b-128e-instruct': {
    open: true,
    weights: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
  }, // Meta: Llama 4 Maverick
  'openai/gpt-5-chat-2025-08-07': { open: false }, // OpenAI: GPT-5 Chat
  'openrouter/healer-alpha': { open: false },
  'inclusionai/ling-2.6-flash-20260421': {
    open: true,
    weights: 'inclusionAI/Ling-2.6-flash',
  }, // inclusionAI: Ling-2.6-flash
  'moonshotai/kimi-k2-0905': {
    open: true,
    weights: 'moonshotai/Kimi-K2-Instruct-0905',
  }, // MoonshotAI: Kimi K2 0905
  'qwen/qwen3-vl-235b-a22b-instruct': {
    open: true,
    weights: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
  }, // Qwen: Qwen3 VL 235B A22B Instruct
  'openrouter/sonoma-sky-alpha': { open: false },
  'mistralai/mistral-small-3.2-24b-instruct-2506': {
    open: true,
    weights: 'mistralai/Mistral-Small-3.2-24B-Instruct-2506',
  }, // Mistral: Mistral Small 3.2 24B
  'tngtech/deepseek-r1t-chimera': {
    open: true,
    weights: 'tngtech/DeepSeek-R1T-Chimera',
  },
  // Corrected 2026-08-24 (was `open: false`). Publisher-declared
  // `hugging_face_id`; repo is public, ungated, MIT, 24 weight files, created
  // 2026-08-02 — before the 2026-08-14 list cut.
  'inclusionai/ling-3.0-flash-20260723': {
    open: true,
    weights: 'inclusionAI/Ling-3.0-flash',
  }, // Ling-3.0-flash (free)
  'openai/gpt-5.2-codex-20260114': { open: false }, // OpenAI: GPT-5.2-Codex
  'moonshotai/kimi-k2': { open: true, weights: 'moonshotai/Kimi-K2-Instruct' }, // MoonshotAI: Kimi K2 0711
  'x-ai/grok-4-07-09': { open: false },
  'deepseek/deepseek-v3.1-terminus': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3.1-Terminus',
  }, // DeepSeek: DeepSeek V3.1 Terminus
  'qwen/qwen3-coder-next-2025-02-03': {
    open: true,
    weights: 'Qwen/Qwen3-Coder-Next',
  }, // Qwen: Qwen3 Coder Next
  'qwen/qwen3-next-80b-a3b-instruct-2509': {
    open: true,
    weights: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
  }, // Qwen: Qwen3 Next 80B A3B Instruct
  'poolside/laguna-xs.2-20260421': {
    open: true,
    weights: 'poolside/Laguna-XS.2',
  },
  'x-ai/grok-4.3-20260430': { open: false }, // xAI: Grok 4.3
  'x-ai/grok-3-mini': { open: false },
  'google/gemini-2.5-flash-lite-preview-06-17': { open: false },
  'openai/gpt-5.6-terra-20260709': { open: false }, // OpenAI: GPT-5.6 Terra
  'openai/gpt-4.1-nano-2025-04-14': { open: false }, // OpenAI: GPT-4.1 Nano
  'qwen/qwen3-coder-30b-a3b-instruct': {
    open: true,
    weights: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  }, // Qwen: Qwen3 Coder 30B A3B Instruct
  'deepseek/deepseek-r1': { open: true, weights: 'deepseek-ai/DeepSeek-R1' }, // DeepSeek: R1
  'qwen/qwen3-32b-04-28': { open: true, weights: 'Qwen/Qwen3-32B' }, // Qwen: Qwen3 32B
  'qwen/qwen3.5-35b-a3b-20260224': {
    open: true,
    weights: 'Qwen/Qwen3.5-35B-A3B',
  }, // Qwen: Qwen3.5-35B-A3B
  'openrouter/horizon-beta': { open: false },
  'poolside/laguna-s-2.1-20260720': {
    open: true,
    weights: 'poolside/Laguna-S-2.1',
  }, // Poolside: Laguna S 2.1 (free)
  'z-ai/glm-4.7-flash-20260119': {
    open: true,
    weights: 'zai-org/GLM-4.7-Flash',
  }, // Z.ai: GLM 4.7 Flash
  'google/gemini-3.6-flash-20260721': { open: false }, // Google: Gemini 3.6 Flash
  'openrouter/polaris-alpha': { open: false },
  'openrouter/sherlock-think-alpha': { open: false },
  'nex-agi/deepseek-v3.1-nex-n1': {
    open: true,
    weights: 'nex-agi/DeepSeek-V3.1-Nex-N1',
  },
  'anthropic/claude-4.1-opus-20250805': { open: false }, // Anthropic: Claude Opus 4.1
  'poolside/laguna-xs-2.1-20260625': {
    open: true,
    weights: 'poolside/Laguna-XS-2.1',
  }, // Poolside: Laguna XS 2.1 (free)
  'openrouter/pony-alpha': { open: false },
  'arcee-ai/trinity-large-thinking': {
    open: true,
    weights: 'arcee-ai/Trinity-Large-Thinking',
  }, // Arcee AI: Trinity Large Thinking
  'moonshotai/kimi-k2-thinking-20251106': {
    open: true,
    weights: 'moonshotai/Kimi-K2-Thinking',
  }, // MoonshotAI: Kimi K2 Thinking
  'anthropic/claude-3-5-haiku': { open: false },
  'qwen/qwen3.5-9b-20260310': { open: true, weights: 'Qwen/Qwen3.5-9B' }, // Qwen: Qwen3.5-9B
  'openai/gpt-5-codex': { open: false }, // OpenAI: GPT-5 Codex
  'openrouter/sonoma-dusk-alpha': { open: false },
  'anthropic/claude-3.5-sonnet': { open: false },
  'google/gemini-3.5-flash-lite-20260721': { open: false }, // Google: Gemini 3.5 Flash Lite
  'deepseek/deepseek-chat-v3': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3',
  }, // DeepSeek: DeepSeek V3
  'anthropic/claude-opus-5-20260723': { open: false }, // Claude Opus 5
  'openai/gpt-4o': { open: false }, // OpenAI: GPT-4o
  'perplexity/pplx-embed-v1-0.6B': {
    open: true,
    weights: 'perplexity-ai/pplx-embed-v1-0.6b',
  },
  'openai/gpt-5.1-chat-20251113': { open: false }, // OpenAI: GPT-5.1 Chat
  'qwen/qwen3.5-plus-20260216': { open: false }, // Qwen: Qwen3.5 Plus 2026-02-15
  'google/gemini-flash-1.5': { open: false },
  'openrouter/sherlock-dash-alpha': { open: false },
  'nvidia/nemotron-3-nano-30b-a3b': {
    open: true,
    weights: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16',
  }, // NVIDIA: Nemotron 3 Nano 30B A3B (free)
  'nvidia/nemotron-nano-12b-v2-vl': {
    open: true,
    weights: 'nvidia/NVIDIA-Nemotron-Nano-12B-v2-VL-BF16',
  }, // NVIDIA: Nemotron Nano 12B 2 VL (free)
  'openai/gpt-5.6-sol-pro-20260709': { open: false }, // OpenAI: GPT-5.6 Sol Pro
  'mistralai/mistral-small-24b-instruct-2501': {
    open: true,
    weights: 'mistralai/Mistral-Small-24B-Instruct-2501',
  }, // Mistral: Mistral Small 3
  'anthropic/claude-4-opus-20250522': { open: false }, // Anthropic: Claude Opus 4
  'openrouter/bert-nebulon-alpha': { open: false },
  'openrouter/horizon-alpha': { open: false },
  'openai/gpt-5.1-codex-20251113': { open: false }, // OpenAI: GPT-5.1-Codex
  'google/gemini-flash-1.5-8b': { open: false },
  'baai/bge-m3-20251117': { open: true, weights: 'BAAI/bge-m3' },
  'qwen/qwen3-vl-8b-instruct': {
    open: true,
    weights: 'Qwen/Qwen3-VL-8B-Instruct',
  }, // Qwen: Qwen3 VL 8B Instruct
  'z-ai/glm-5v-turbo-20260401': { open: false }, // Z.ai: GLM 5V Turbo
  'mistralai/devstral-small-2507': {
    open: true,
    weights: 'mistralai/Devstral-Small-2505',
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    open: true,
    weights: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  }, // Meta: Llama 4 Scout
  'microsoft/phi-4': { open: true, weights: 'microsoft/phi-4' }, // Microsoft: Phi 4
  'google/gemini-embedding-001': { open: false },
  'meta-llama/llama-3.1-70b-instruct': {
    open: true,
    weights: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
  }, // Meta: Llama 3.1 70B Instruct
  'openai/text-embedding-3-large': { open: false },
  'qwen/qwen3-embedding-4b': { open: true, weights: 'Qwen/Qwen3-Embedding-4B' },
  'google/gemini-3.1-pro-preview-customtools-20260219': { open: false }, // Google: Gemini 3.1 Pro Preview Custom Tools
  'qwen/qwen3-235b-a22b-thinking-2507': {
    open: true,
    weights: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
  }, // Qwen: Qwen3 235B A22B Thinking 2507
  // Corrected 2026-08-24 (was `open: false`). Public, ungated, 6 weight files,
  // 91k downloads, created 2026-03-31. `license:other` is not disqualifying —
  // the test is whether anyone can download the weights, the same reading that
  // puts Llama and Gemma on the open side.
  'mistralai/mistral-medium-3.5-20260430': {
    open: true,
    weights: 'mistralai/Mistral-Medium-3.5-128B',
  }, // Mistral: Mistral Medium 3.5
  'qwen/qwen3-coder-plus': { open: false }, // Qwen: Qwen3 Coder Plus
  'x-ai/grok-4.20-20260309': { open: false }, // xAI: Grok 4.20
  'alibaba/tongyi-deepresearch-30b-a3b': { open: false },
  'qwen/qwen3.6-flash': { open: false }, // Qwen: Qwen3.6 Flash
  'qwen/qwen3.6-35b-a3b-20260415': {
    open: true,
    weights: 'Qwen/Qwen3.6-35B-A3B',
  }, // Qwen: Qwen3.6 35B A3B
  'meta-llama/llama-3.2-3b-instruct': {
    open: true,
    weights: 'meta-llama/Llama-3.2-3B-Instruct',
  }, // Meta: Llama 3.2 3B Instruct
  'deepseek/deepseek-r1-0528-qwen3-8b': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
  },
  'qwen/qwen3-vl-32b-instruct': {
    open: true,
    weights: 'Qwen/Qwen3-VL-32B-Instruct',
  }, // Qwen: Qwen3 VL 32B Instruct
  'mistralai/codestral-2508': { open: false }, // Mistral: Codestral 2508
  'qwen/qwq-32b': { open: true, weights: 'Qwen/QwQ-32B' },
  'openrouter/andromeda-alpha': { open: false },
  'qwen/qwen3-next-80b-a3b-thinking-2509': {
    open: true,
    weights: 'Qwen/Qwen3-Next-80B-A3B-Thinking',
  }, // Qwen: Qwen3 Next 80B A3B Thinking
  'qwen/qwen3-14b-04-28': { open: true, weights: 'Qwen/Qwen3-14B' }, // Qwen: Qwen3 14B
  'openai/o4-mini-2025-04-16': { open: false }, // OpenAI: o4 Mini
  'google/gemma-3-4b-it': { open: true, weights: 'google/gemma-3-4b-it' }, // Google: Gemma 3 4B
  'qwen/qwen2.5-vl-72b-instruct': {
    open: true,
    weights: 'Qwen/Qwen2.5-VL-72B-Instruct',
  }, // Qwen: Qwen2.5 VL 72B Instruct
  'bytedance-seed/seed-2.0-mini-20260224': { open: false }, // ByteDance Seed: Seed-2.0-Mini
  'openai/gpt-4o-mini-2024-07-18': { open: false }, // OpenAI: GPT-4o-mini (2024-07-18)
  'intfloat/multilingual-e5-large-20251117': {
    open: true,
    weights: 'intfloat/multilingual-e5-large',
  },
  'qwen/qwen-2.5-72b-instruct': {
    open: true,
    weights: 'Qwen/Qwen2.5-72B-Instruct',
  }, // Qwen2.5 72B Instruct
  'qwen/qwen3-vl-235b-a22b-thinking': {
    open: true,
    weights: 'Qwen/Qwen3-VL-235B-A22B-Thinking',
  }, // Qwen: Qwen3 VL 235B A22B Thinking
  'qwen/qwen-2.5-7b-instruct': {
    open: true,
    weights: 'Qwen/Qwen2.5-7B-Instruct',
  }, // Qwen: Qwen2.5 7B Instruct
  'qwen/qwen3-30b-a3b-instruct-2507': {
    open: true,
    weights: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
  }, // Qwen: Qwen3 30B A3B Instruct 2507
  'deepseek/deepseek-v3.2-speciale-20251201': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-V3.2-Speciale',
  },
  'tngtech/tng-r1t-chimera': { open: false },
  'openrouter/aurora-alpha': { open: false },
  // Corrected 2026-08-24 (was `open: false`). OpenRouter's description states
  // it is "released under the Apache 2.0 license"; the repo is public,
  // ungated, apache-2.0, 272 weight files.
  //
  // Cites Instruct, not Base. Both are public and both would satisfy the
  // "are the weights downloadable" test, so the verdict is the same either
  // way — but the OpenRouter slug serves the instruction-tuned model, and the
  // Base card says it is not instruction-fine-tuned. The citation is the
  // artifact a reader checks and the one the nightly ROT audit re-verifies,
  // so it should name the checkpoint actually being served.
  'mistralai/mistral-large-2512': {
    open: true,
    weights: 'mistralai/Mistral-Large-3-675B-Instruct-2512',
  }, // Mistral: Mistral Large 3 2512
  'mistralai/ministral-8b-2512': {
    open: true,
    weights: 'mistralai/Ministral-3-8B-Instruct-2512',
  }, // Mistral: Ministral 3 8B 2512
  'google/gemini-2.5-flash-image-preview': { open: false },
  'mistralai/ministral-14b-2512': {
    open: true,
    weights: 'mistralai/Ministral-3-14B-Instruct-2512',
  }, // Mistral: Ministral 3 14B 2512
  'openai/gpt-oss-safeguard-20b': {
    open: true,
    weights: 'openai/gpt-oss-safeguard-20b',
  }, // OpenAI: gpt-oss-safeguard-20b
  'openai/gpt-5.3-chat-20260303': { open: false }, // OpenAI: GPT-5.3 Chat
  'qwen/qwen3-235b-a22b-04-28': { open: true, weights: 'Qwen/Qwen3-235B-A22B' }, // Qwen: Qwen3 235B A22B
  'microsoft/wizardlm-2-8x22b': { open: false }, // WizardLM-2 8x22B
  'qwen/qwen2.5-vl-32b-instruct': {
    open: true,
    weights: 'Qwen/Qwen2.5-VL-32B-Instruct',
  },
  'mistralai/mistral-small-3.1-24b-instruct-2503': {
    open: true,
    weights: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503',
  }, // Mistral: Mistral Small 3.1 24B
  'qwen/qwen3-8b-04-28': { open: true, weights: 'Qwen/Qwen3-8B' }, // Qwen: Qwen3 8B
  'google/gemma-3n-e4b-it': { open: true, weights: 'google/gemma-3n-E4B-it' }, // Google: Gemma 3n 4B
  'google/gemini-2.0-flash-exp': { open: false },
  'sentence-transformers/all-minilm-l6-v2-20251117': {
    open: true,
    weights: 'sentence-transformers/all-MiniLM-L6-v2',
  },
  'openai/gpt-4o-2024-11-20': { open: false }, // OpenAI: GPT-4o (2024-11-20)
  'openai/o3-2025-04-16': { open: false }, // OpenAI: o3
  'z-ai/glm-4.5v': { open: true, weights: 'zai-org/GLM-4.5V' }, // Z.ai: GLM 4.5V
  'anthropic/claude-3-haiku': { open: false }, // Anthropic: Claude 3 Haiku
  'amazon/nova-lite-v1': { open: false }, // Amazon: Nova Lite 1.0
  'meta-llama/llama-3.2-1b-instruct': {
    open: true,
    weights: 'meta-llama/Llama-3.2-1B-Instruct',
  }, // Meta: Llama 3.2 1B Instruct
  'mistralai/ministral-3b': { open: false },
  'deepseek/deepseek-r1-distill-llama-70b': {
    open: true,
    weights: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
  }, // DeepSeek: R1 Distill Llama 70B
  'openai/chatgpt-4o-latest': { open: false },
  'x-ai/grok-3-mini-beta': { open: false },
}

/**
 * Strip OpenRouter's variant suffix (`deepseek/x:free` -> `deepseek/x`). The
 * free tier is the same weights on cheaper hardware, so it classifies
 * identically and must not read as an unknown model.
 */
export const basePermaslug = (permaslug: string): string => {
  const colon = permaslug.indexOf(':')
  return colon === -1 ? permaslug : permaslug.slice(0, colon)
}

/**
 * Is this a well-formed permaslug key — exactly `owner/model`?
 *
 * `basePermaslug` normalises but does not validate, and every caller that
 * checked at all checked `includes('/')`, which admits `/x`, `x/`, `/` and
 * `x//y`. With the CLI's --create flag any of those could be INSERTED as a
 * classification row, and nothing in the index would ever match one: a key
 * that cannot correspond to a model is a row that can only ever be noise in
 * the queue and the audit.
 *
 * Lives here rather than in each caller because the gap was central — the
 * API, the CLI and upsertClassification all shared it.
 */
export const isValidPermaslug = (permaslug: string): boolean =>
  // No whitespace anywhere, not merely non-blank segments. A `trim().length > 0`
  // check passed `openai /gpt-4`, `openai/ gpt-4` and `openai/gpt 4` — keys
  // that look right in a log line, match no model, and which the central upsert
  // would then persist. The rankings dataset never emits a slug containing a
  // space, so anything that does is a paste or a typo.
  /^[^/\s]+\/[^/\s]+$/.test(permaslug)
export const classifyModel = (
  permaslug: string,
  classifications: ModelClassifications = OPEN_WEIGHT_MODELS
): ModelClassification | undefined => classifications[basePermaslug(permaslug)]

/** One row of OpenRouter's `datasets/rankings-daily` payload. */
export type RankingRow = {
  date: string // YYYY-MM-DD, UTC
  model_permaslug: string
  total_tokens: string // decimal string; the aggregate overflows a double
}

export type OpenWeightShareResult = {
  /** 0-100, or null when nothing classified (never write a null). */
  share: number | null
  /** UTC dates actually included, oldest first. */
  dates: string[]
  /** Permaslugs seen in the window with no entry in the list. */
  unclassified: string[]
  /** Rows in the window whose token count could not be parsed. */
  invalidTokenRows: string[]
  /** True when the aggregated `other` row is present in the payload. */
  hasExcludedPayload: boolean
  /**
   * U/C — unclassified tokens over classified tokens, the quantity
   * UNCLASSIFIED_TOKEN_SHARE_CAP bounds. 0 when everything is classified.
   */
  unclassifiedShareOfClassified: number
  /** Token counts, as doubles — display/telemetry only, never the divisor. */
  openTokens: number
  classifiedTokens: number
  unclassifiedTokens: number
  otherTokens: number
  /**
   * Router and floating-alias slugs seen in the window, and their volume.
   * Excluded from both sides (rule 1b); surfaced so the exclusion is visible
   * in the logs rather than silently shrinking the denominator.
   */
  compositeSlugs: string[]
  compositeTokens: number
  /** Everything in the payload including `other` and unclassified models. */
  payloadTokens: number
}

/**
 * The UTC dates to request. We ask for one day more than the window at the
 * head: OpenRouter currently clamps `end_date` to the last COMPLETE UTC day,
 * so this yields exactly `days` complete days — but if they ever start
 * publishing the current partial day, it is picked up automatically and the
 * window becomes a true trailing-N-days with no code change.
 *
 * UTC throughout, via epoch arithmetic rather than calendar math: a UTC day
 * is always exactly DAY_MS, so there is no DST edge to get wrong.
 */
export const openWeightWindowRange = (
  nowMs: number,
  days = OPEN_WEIGHT_WINDOW_DAYS
) => ({
  startDate: utcDateString(nowMs - days * DAY_MS),
  endDate: utcDateString(nowMs),
})

export const utcDateString = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10)

/**
 * How far behind today's UTC date the newest complete day in an OpenRouter
 * payload may be before every index computed from it refuses to publish.
 *
 * The hourly job stamps each point at Date.now(), which is what keeps the
 * 3h feed-staleness and 6h trading gates honest — but only if the payload
 * underneath is actually moving. A frozen response (the same seven old days
 * served forever) would otherwise be re-stamped as fresh every hour and
 * never trip either gate. Normally the newest complete day is yesterday
 * (lag 1); a late upstream publish makes it 2. Three tolerates that without
 * relaying a dead dataset for a week.
 */
export const OPENROUTER_MAX_SOURCE_LAG_DAYS = 3

/**
 * Whole UTC days between the newest date in the payload and today's UTC
 * date, or null when the date does not parse.
 */
export const openRouterSourceLagDays = (
  newestDate: string,
  nowMs: number
): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newestDate)) return null
  const newestMs = Date.parse(`${newestDate}T00:00:00Z`)
  const todayMs = Date.parse(`${utcDateString(nowMs)}T00:00:00Z`)
  if (!Number.isFinite(newestMs) || !Number.isFinite(todayMs)) return null
  // Date.parse is lenient about impossible calendar dates: '2026-02-31'
  // rolls forward to March 3 instead of failing. Round-trip so a provider
  // typo is reported as invalid rather than measured against a different day.
  if (utcDateString(newestMs) !== newestDate) return null
  return Math.round((todayMs - newestMs) / DAY_MS)
}

/**
 * Reject a payload whose newest complete day is too far behind today. Shared
 * by every OpenRouter index, checked once per fetch before any of them
 * publishes. Returns the reason, or null when the source is fresh enough.
 */
export const validateOpenRouterSourceFreshness = (args: {
  rows: RankingRow[]
  now: number
  maxLagDays?: number
}): string | null => {
  const { rows, now, maxLagDays = OPENROUTER_MAX_SOURCE_LAG_DAYS } = args
  const newest = newestWindowDates(rows, 1)[0]
  if (!newest) return 'payload has no dated rows'
  const lag = openRouterSourceLagDays(newest, now)
  if (lag == null) return `newest day ${newest} is not a valid date`
  if (lag < 0)
    return `newest day ${newest} is after today (${utcDateString(now)})`
  if (lag > maxLagDays)
    return (
      `newest complete day ${newest} is ${lag} days behind ` +
      `${utcDateString(now)} (max ${maxLagDays}); the source is stale`
    )
  return null
}

/** The newest `days` distinct dates present in `rows`, oldest first. */
export const newestWindowDates = (
  rows: RankingRow[],
  days = OPEN_WEIGHT_WINDOW_DAYS
): string[] => {
  const seen: Record<string, true> = {}
  for (const r of rows) if (r.date) seen[r.date] = true
  return Object.keys(seen).sort().slice(-days)
}

/**
 * The index. Percentage of tokens, among the top-50 models over the trailing
 * window, that went to open-weight models.
 *
 *   share = 100 * (open-weight tokens) / (ALL CLASSIFIED tokens)
 *
 * `other` is excluded from the denominator (rule 1) and unclassified models
 * are excluded from both sides (rule 2) — so the denominator is strictly the
 * models we can actually name.
 *
 * Summed as BigInt: a single model clears 1e12 tokens/day and the 7-day
 * aggregate runs past Number.MAX_SAFE_INTEGER, where doubles start silently
 * dropping units.
 */
export const computeOpenWeightShare = (
  allRows: RankingRow[],
  days = OPEN_WEIGHT_WINDOW_DAYS,
  classifications: ModelClassifications = OPEN_WEIGHT_MODELS
): OpenWeightShareResult => {
  const dates = newestWindowDates(allRows, days)
  const inWindow: Record<string, true> = {}
  for (const d of dates) inWindow[d] = true
  const rows = allRows.filter((r) => inWindow[r.date])

  let openTokens = 0n
  let classifiedTokens = 0n
  let unclassifiedTokens = 0n
  let otherTokens = 0n
  let compositeTokens = 0n
  let payloadTokens = 0n
  const unclassifiedSet: Record<string, true> = {}
  const compositeSet: Record<string, true> = {}
  const invalidTokenRowSet: Record<string, true> = {}

  for (const row of rows) {
    const tokens = parseTokens(row.total_tokens)
    if (tokens == null) {
      invalidTokenRowSet[`${row.date}:${row.model_permaslug}`] = true
      continue
    }
    payloadTokens += tokens

    // Rule 1: `other` is unclassifiable by construction — never in the
    // denominator, never estimated.
    if (basePermaslug(row.model_permaslug) === OTHER_MODEL_KEY) {
      otherTokens += tokens
      continue
    }

    // Rule 1b: routers and floating aliases are not a single model, so no
    // boolean about them is true. Out of both sides like `other`, and recorded
    // rather than dropped — the caller logs the slugs and the volume.
    if (isCompositeSlug(row.model_permaslug)) {
      compositeSet[basePermaslug(row.model_permaslug)] = true
      compositeTokens += tokens
      continue
    }

    const classification = classifyModel(row.model_permaslug, classifications)
    // Rule 2: unknown model -> out of BOTH sides, and surfaced so the caller
    // can alert. Defaulting it either way would move the index on a guess.
    // Its tokens are still counted, because how MUCH is unclassified is what
    // decides whether the index may publish at all.
    if (!classification) {
      // Keyed on the BASE slug, like everything else that touches an
      // unclassified model: the grace-window rows are stored base, so the
      // publication gate's expiry check compares these strings against base
      // slugs. A raw `foo:free` key here would never match `foo` there, and a
      // model that only ever ranks as its :free variant would publish under
      // grace forever — which is exactly how nemotron-3.5-lightning entered
      // the top 50 (see its note above).
      unclassifiedSet[basePermaslug(row.model_permaslug)] = true
      unclassifiedTokens += tokens
      continue
    }

    classifiedTokens += tokens
    if (classification.open) openTokens += tokens
  }

  const invalidTokenRows = Object.keys(invalidTokenRowSet).sort()
  const share =
    classifiedTokens > 0n && invalidTokenRows.length === 0
      ? Number(
          (openTokens * 100n * OPEN_WEIGHT_SHARE_SCALE) / classifiedTokens
        ) / Number(OPEN_WEIGHT_SHARE_SCALE)
      : null

  return {
    share,
    dates,
    unclassified: Object.keys(unclassifiedSet).sort(),
    compositeSlugs: Object.keys(compositeSet).sort(),
    invalidTokenRows,
    // Checked against `other` specifically, not "payload exceeds classified":
    // unclassified tokens also widen that gap, so the loose form would read a
    // payload with an unknown model but NO `other` row as healthy.
    hasExcludedPayload: otherTokens > 0n,
    unclassifiedShareOfClassified: ratioOfBigInts(
      unclassifiedTokens,
      classifiedTokens
    ),
    openTokens: finiteBigIntTelemetry(openTokens),
    classifiedTokens: finiteBigIntTelemetry(classifiedTokens),
    unclassifiedTokens: finiteBigIntTelemetry(unclassifiedTokens),
    otherTokens: finiteBigIntTelemetry(otherTokens),
    compositeTokens: finiteBigIntTelemetry(compositeTokens),
    payloadTokens: finiteBigIntTelemetry(payloadTokens),
  }
}

/**
 * numerator/denominator without going through doubles first — both sides
 * routinely exceed Number.MAX_SAFE_INTEGER, where the naive Number(a)/Number(b)
 * has already dropped units. Returns 0 for an empty denominator so a payload
 * with nothing classified reports "no unclassified pressure" and is rejected
 * by the share check instead.
 */
const ratioOfBigInts = (numerator: bigint, denominator: bigint): number =>
  denominator > 0n
    ? Number((numerator * OPEN_WEIGHT_SHARE_SCALE) / denominator) /
      Number(OPEN_WEIGHT_SHARE_SCALE)
    : 0

const OPEN_WEIGHT_SHARE_SCALE = 1_000_000_000n

const finiteBigIntTelemetry = (value: bigint) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Number.MAX_VALUE
}

/**
 * Fractional counts are truncated because OpenRouter may serialize an integer
 * aggregate with a decimal suffix. Any other malformed count returns null so
 * the whole observation can fail closed instead of zeroing only one side.
 */
const parseTokens = (raw: string): bigint | null => {
  if (typeof raw !== 'string') return null
  const m = /^(\d+)(?:\.\d+)?$/.exec(raw.trim())
  return m ? BigInt(m[1]) : null
}

/** Details of a publication that excluded unknown models under the cap. */
export type OpenWeightGrace = {
  /** The excluded permaslugs — named on every grace publication, never silent. */
  unclassified: string[]
  /** U/C at publication time. */
  shareOfClassified: number
  /** Worst-case error, in percentage POINTS, the exclusion can cause. */
  maxIndexError: number
}

export type OpenWeightPublicationValidation =
  | { ok: true; share: number; grace?: OpenWeightGrace }
  | { ok: false; reason: string }

export type OpenWeightPublicationOptions = {
  expectedDays?: number
  /** Override the cap; 0 restores the old halt-on-any-unknown behaviour. */
  unclassifiedShareCap?: number
  /** Bound on router/alias tokens; defaults to COMPOSITE_TOKEN_SHARE_CAP. */
  compositeShareCap?: number
  /**
   * Unknowns that have been unclassified for longer than the operator's grace
   * window. Present here they halt the index regardless of how small they are:
   * the cap buys time to classify, it is not a licence to run indefinitely on
   * a knowingly incomplete denominator. Supplied by the caller because the
   * first-seen timestamps live in the database, not in this leaf package.
   */
  expiredUnclassified?: string[]
}

/**
 * Fail-closed publication gate shared by the live writer and backfill.
 * Computing a diagnostic share is useful, but it is not enough to make that
 * share safe to expose as an executable oracle price.
 *
 * Structural checks run before the unclassified decision so that a payload
 * which is broken in several ways reports the more fundamental fault, and so
 * the grace path can quote a share it has already validated.
 */
export const validateOpenWeightPublication = (
  result: OpenWeightShareResult,
  options: OpenWeightPublicationOptions = {}
): OpenWeightPublicationValidation => {
  const {
    expectedDays = OPEN_WEIGHT_WINDOW_DAYS,
    unclassifiedShareCap = UNCLASSIFIED_TOKEN_SHARE_CAP,
    compositeShareCap = COMPOSITE_TOKEN_SHARE_CAP,
    expiredUnclassified = [],
  } = options

  if (result.invalidTokenRows.length > 0)
    return {
      ok: false,
      reason: `malformed token count rows: ${result.invalidTokenRows.join(
        ', '
      )}`,
    }
  if (result.dates.length !== expectedDays)
    return {
      ok: false,
      reason: `incomplete window: expected ${expectedDays} days, got ${result.dates.length}`,
    }
  for (let i = 1; i < result.dates.length; i++) {
    const previous = Date.parse(result.dates[i - 1])
    const current = Date.parse(result.dates[i])
    if (!Number.isFinite(previous) || !Number.isFinite(current)) {
      const invalidDate = !Number.isFinite(previous)
        ? result.dates[i - 1]
        : result.dates[i]
      return {
        ok: false,
        reason: `invalid window date: ${invalidDate}`,
      }
    }
    if (current - previous !== DAY_MS)
      return {
        ok: false,
        reason: `non-consecutive window dates: ${result.dates.join(', ')}`,
      }
  }
  if (!result.hasExcludedPayload)
    return {
      ok: false,
      reason: 'payload has no excluded `other` tokens',
    }
  if (
    result.share == null ||
    !Number.isFinite(result.share) ||
    result.share < 0 ||
    result.share > 100
  )
    return { ok: false, reason: `invalid share ${result.share}` }

  // Composite slugs leave the denominator without ever being adjudicated, so
  // unlike an unclassified model nothing else bounds them: no grace clock, no
  // U/C cap. At small volume that is the intended trade (see isCompositeSlug).
  // Past this cap it stops being a rounding decision — the index would be
  // reporting a share of a materially different population than the
  // methodology claims — so it halts and someone resolves the alias through
  // `alias_target` or reconsiders the router.
  if (
    result.classifiedTokens > 0 &&
    result.compositeTokens / result.classifiedTokens > compositeShareCap
  )
    return {
      ok: false,
      reason: `composite (router/alias) slugs are ${(
        (result.compositeTokens / result.classifiedTokens) *
        100
      ).toFixed(2)}% of classified tokens, over the ${(
        compositeShareCap * 100
      ).toFixed(2)}% cap: ${result.compositeSlugs.join(', ')}`,
    }

  if (result.unclassified.length === 0) return { ok: true, share: result.share }

  const expired = result.unclassified.filter((slug) =>
    expiredUnclassified.includes(slug)
  )
  if (expired.length > 0)
    return {
      ok: false,
      reason: `unclassified models past their grace window: ${expired.join(
        ', '
      )}`,
    }

  const w = result.unclassifiedShareOfClassified
  if (!Number.isFinite(w) || w > unclassifiedShareCap)
    return {
      ok: false,
      reason:
        `unclassified models hold ${(w * 100).toFixed(3)}% of classified ` +
        `tokens, over the ${(unclassifiedShareCap * 100).toFixed(3)}% cap: ` +
        result.unclassified.join(', '),
    }

  return {
    ok: true,
    share: result.share,
    grace: {
      unclassified: result.unclassified,
      shareOfClassified: w,
      maxIndexError: maxIndexErrorPoints(result.share, w),
    },
  }
}

/**
 * Worst-case percentage-POINT error from excluding unknowns, per the bound
 * documented on UNCLASSIFIED_TOKEN_SHARE_CAP: w * max(p, 1-p) / (1 + w), with
 * p the reported share as a fraction. Attained when every unclassified token
 * turns out to sit on one side.
 */
export const maxIndexErrorPoints = (
  sharePercent: number,
  unclassifiedShareOfClassified: number
): number => {
  const p = sharePercent / 100
  const w = unclassifiedShareOfClassified
  return (100 * w * Math.max(p, 1 - p)) / (1 + w)
}
