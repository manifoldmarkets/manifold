import { DAY_MS } from '../util/time'

// The open-weight share index: what fraction of the tokens routed through
// OpenRouter's top-50 models went to models whose weights the public can
// download.
//
// This file is the published methodology, not an implementation detail. It
// lives in `common` (a leaf package) precisely so `web` can render the same
// classification list the oracle scores against — a settlement source nobody
// can inspect is a settlement source people dispute.
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

/**
 * Feed id. Lives in `common` rather than `backend/shared/src/oracle.ts` (which
 * re-exports it) because `web` needs it to decide when to render this
 * methodology, and web must never import from backend.
 */
export const OPENROUTER_OPEN_WEIGHT_FEED_ID = 'openrouter-open-weight-share'

/** Bump when the map changes. Rendered on the market page. */
export const OPEN_WEIGHT_LIST_VERSION = '2026-07-27'

/** Trailing window, in whole UTC days, that the index averages over. */
export const OPEN_WEIGHT_WINDOW_DAYS = 7

/**
 * OpenRouter aggregates everything outside the top 50 into a single row under
 * this key. It cannot be classified, so it is excluded from the denominator —
 * the index is defined over the top 50 and says so on the market page. We do
 * not estimate it.
 */
export const OTHER_MODEL_KEY = 'other'

export type ModelClassification = {
  /** True iff the weights are publicly downloadable. */
  open: boolean
  /** Public weights repo — the evidence backing an `open` call. */
  weights?: string
}

/**
 * Keyed on the BASE permaslug. OpenRouter bills the same weights under
 * variant suffixes (`...:free`), which are the same model for index purposes.
 */
export const OPEN_WEIGHT_MODELS: Record<string, ModelClassification> = {
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
  'moonshotai/kimi-k3-20260715': { open: false }, // MoonshotAI: Kimi K3
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
  'inclusionai/ling-3.0-flash-20260723': { open: false }, // Ling-3.0-flash (free)
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
  'mistralai/mistral-medium-3.5-20260430': { open: false }, // Mistral: Mistral Medium 3.5
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
  'mistralai/mistral-large-2512': { open: false }, // Mistral: Mistral Large 3 2512
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

export const classifyModel = (
  permaslug: string
): ModelClassification | undefined =>
  OPEN_WEIGHT_MODELS[basePermaslug(permaslug)]

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
  /** Token counts, as doubles — display/telemetry only, never the divisor. */
  openTokens: number
  classifiedTokens: number
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
  days = OPEN_WEIGHT_WINDOW_DAYS
): OpenWeightShareResult => {
  const dates = newestWindowDates(allRows, days)
  const inWindow: Record<string, true> = {}
  for (const d of dates) inWindow[d] = true
  const rows = allRows.filter((r) => inWindow[r.date])

  let openTokens = 0n
  let classifiedTokens = 0n
  let payloadTokens = 0n
  const unclassifiedSet: Record<string, true> = {}

  for (const row of rows) {
    const tokens = parseTokens(row.total_tokens)
    payloadTokens += tokens

    // Rule 1: `other` is unclassifiable by construction — never in the
    // denominator, never estimated.
    if (basePermaslug(row.model_permaslug) === OTHER_MODEL_KEY) continue

    const classification = classifyModel(row.model_permaslug)
    // Rule 2: unknown model -> out of BOTH sides, and surfaced so the caller
    // can alert. Defaulting it either way would move the index on a guess.
    if (!classification) {
      unclassifiedSet[row.model_permaslug] = true
      continue
    }

    classifiedTokens += tokens
    if (classification.open) openTokens += tokens
  }

  return {
    share:
      classifiedTokens > 0n
        ? (100 * Number(openTokens)) / Number(classifiedTokens)
        : null,
    dates,
    unclassified: Object.keys(unclassifiedSet).sort(),
    openTokens: Number(openTokens),
    classifiedTokens: Number(classifiedTokens),
    payloadTokens: Number(payloadTokens),
  }
}

/**
 * Tolerant of junk: a malformed count contributes 0 rather than throwing.
 *
 * A fractional value is truncated rather than rejected. If the upstream
 * format ever drifts to `"1542145933359.0"`, rejecting would zero SOME rows
 * and keep others, silently skewing the index toward whichever side still
 * parsed — a wrong number is far worse here than a rounded one. Rejecting
 * everything is safe by comparison (share goes null, the job logs and skips).
 */
const parseTokens = (raw: string): bigint => {
  if (typeof raw !== 'string') return 0n
  const m = /^(\d+)(?:\.\d+)?$/.exec(raw.trim())
  return m ? BigInt(m[1]) : 0n
}

/** The classification list, shaped for display. Open models first. */
export const openWeightModelList = () =>
  Object.entries(OPEN_WEIGHT_MODELS)
    .map(([permaslug, c]) => ({ permaslug, ...c }))
    .sort((a, b) =>
      a.open === b.open
        ? a.permaslug.localeCompare(b.permaslug)
        : a.open
        ? -1
        : 1
    )
