import { DAY_MS } from '../util/time'
import {
  COMPOSITE_TOKEN_SHARE_CAP,
  OPEN_WEIGHT_WINDOW_DAYS,
  OTHER_MODEL_KEY,
  RankingRow,
  UNCLASSIFIED_TOKEN_SHARE_CAP,
  basePermaslug,
  isCompositeSlug,
  isValidPermaslug,
  newestWindowDates,
} from './open-weight-models'

// Lab-share indexes on OpenRouter: what fraction of the tokens routed through
// OpenRouter's top-50 models went to (a) Anthropic, and (b) Chinese labs.
//
// This file is the published methodology, not an implementation detail — the
// same reasoning as open-weight-models.ts, and deliberately the same window,
// the same denominator, and the same exclusions, so the three OpenRouter
// indexes are one family that a reader can compare directly. It lives in
// `common` (a leaf package) so the rule the oracle is scored against is one
// auditable artifact.
//
// THE UNIT OF CLASSIFICATION IS THE AUTHOR, NOT THE MODEL.
//
// OpenRouter keys every ranked row on a permaslug `author/model[:variant]`.
// The author segment is the publisher's OpenRouter organisation — `anthropic`,
// `deepseek`, `qwen` — and it is stable across that publisher's releases. So
// where the open-weight index has to adjudicate every new MODEL (weights are
// released per model), these indexes only ever have to place a new AUTHOR,
// which happens a few times a year rather than a few times a week. That is
// the whole design goal: a classification burden of zero for Anthropic and a
// one-line constant for Chinese labs.
//
//   share = 100 * (numerator tokens) / (denominator tokens)
//
//   window        the newest OPEN_WEIGHT_WINDOW_DAYS complete UTC days present
//                 in the payload (newestWindowDates), trailing seven days
//   author(row)   the segment of basePermaslug(model_permaslug) before the
//                 first `/`; a slug that is not `owner/model` (isValidPermaslug)
//                 is MALFORMED and fails the whole publication closed, exactly
//                 as an unparseable token count does
//   denominator   every row in the window except OTHER_MODEL_KEY and composite
//                 slugs (routers and `~` floating aliases, isCompositeSlug) —
//                 the same exclusions the open-weight index makes, for the same
//                 reasons written up there; both volumes are reported so the
//                 job can log the exclusion like it does today
//
// ANTHROPIC: numerator = rows whose author is exactly `anthropic`. Nothing
// else: no name matching, no "Claude" heuristics. Cloaked `openrouter/*`
// slugs stay in the denominator and never in the numerator, whoever is behind
// them; if one is later unmasked as an Anthropic model, that reclassifies
// FORWARD from the unmasking, never retroactively — the same rule the
// open-weight index applies to unmasked stealth models. There is no unknown-
// author concept here: every valid row is either Anthropic or not, so the
// feed publishes whenever the payload validates.
//
// CHINESE LABS: numerator = rows whose author is in CHINESE_LAB_AUTHORS; the
// rest of the denominator is rows whose author is in KNOWN_NON_CHINESE_AUTHORS.
// An author in NEITHER list is UNKNOWN: its tokens are excluded from both
// sides (never defaulted — a mis-defaulted lab would move the index on a
// guess) and returned in `unknownAuthors`. The publication rule:
//
//   - unknown-author tokens over UNKNOWN_AUTHOR_TOKEN_SHARE_CAP of classified
//     tokens -> the feed REFUSES to publish and the job logs an ERROR naming
//     the authors and telling the reader which constant to extend;
//   - at or below the cap -> the feed publishes and the job logs a WARN
//     naming the same authors.
//
// That is the entire maintenance path, on purpose. No database rows, no
// grace window, no admin tool, no auto-classifier: a new author is a one-line
// addition to one of the two constants below (with its evidence) and a
// deploy. Authors appear rarely enough that this is the right budget, and a
// mechanism heavier than a constant would be more code than the feed itself.
// KNOWN_NON_CHINESE_AUTHORS exists so that "unknown" means genuinely new, not
// "we never wrote it down": every author seen in the open-weight seed list on
// the version date is in exactly one of the two lists, except where the
// header of that constant says otherwise.
//
// The test for "Chinese lab" is the company's headquarters (its principal
// place of business), recorded as the evidence string. Where a publisher's
// weights are served under a different organisation's slug, the SLUG's author
// decides, because that is what OpenRouter attributes the tokens to.
//
// Pre-committed edge cases, so they are never adjudicated mid-market:
//   - A lab relocating or being acquired reclassifies FORWARD from the
//     announcement, with the list version bumped; history is never rewritten.
//   - A Chinese lab's model served under a non-Chinese author slug (or vice
//     versa) counts by SLUG. The methodology is "tokens attributed by
//     OpenRouter to authors headquartered in China", not "models with
//     Chinese ancestry" — the former is checkable in seconds, the latter is
//     not.
//   - `openrouter/*` stealth slugs are KNOWN_NON_CHINESE for denominator
//     purposes (they are in the denominator, not the numerator) and never
//     unknown: an unknown that can never be resolved would halt the feed
//     forever. If one is unmasked as a Chinese lab's model, forward-only.

/** Bump when either author list changes. */
export const CHINESE_LAB_LIST_VERSION = '2026-09-02'

/** The one author the Anthropic index counts. */
export const ANTHROPIC_AUTHOR = 'anthropic'

/**
 * How much of the classified token pool may sit in unknown authors before
 * the Chinese-lab index refuses to publish, as U/C (unknown tokens over
 * classified tokens). The same number as the open-weight index's unclassified
 * cap and for the same reason: the bound it buys on the published share is
 * strictly under the cap (see UNCLASSIFIED_TOKEN_SHARE_CAP for the algebra),
 * so a sub-cap unknown costs at most a fraction of a point until someone adds
 * one line. Its own constant so the two can be tuned apart if they ever need
 * to be.
 */
export const UNKNOWN_AUTHOR_TOKEN_SHARE_CAP = UNCLASSIFIED_TOKEN_SHARE_CAP

export type AuthorEvidence = {
  /** One line: the company and where it is headquartered. */
  evidence: string
}

/**
 * Authors headquartered in China. Keyed on the OpenRouter author segment.
 *
 * Seeded from every author present in OPEN_WEIGHT_MODELS at
 * OPEN_WEIGHT_LIST_VERSION 2026-08-24, plus a pre-seeded set of well-known
 * labs that have not (yet) entered the ranked window, so that their first
 * appearance is a numerator move rather than a halt.
 */
export const CHINESE_LAB_AUTHORS: Readonly<Record<string, AuthorEvidence>> = {
  // Seen in the open-weight seed list.
  qwen: { evidence: "Alibaba Cloud's Qwen team, Hangzhou" },
  deepseek: { evidence: 'DeepSeek, Hangzhou' },
  'z-ai': { evidence: 'Zhipu AI (Z.ai), Beijing' },
  moonshotai: { evidence: 'Moonshot AI, Beijing' },
  xiaomi: { evidence: 'Xiaomi (MiMo), Beijing' },
  minimax: { evidence: 'MiniMax, Shanghai' },
  inclusionai: { evidence: "inclusionAI, Ant Group's model lab, Hangzhou" },
  tencent: { evidence: 'Tencent (Hunyuan), Shenzhen' },
  stepfun: { evidence: 'StepFun, Shanghai' },
  'bytedance-seed': { evidence: 'ByteDance Seed, Beijing' },
  baai: { evidence: 'Beijing Academy of Artificial Intelligence, Beijing' },
  alibaba: { evidence: 'Alibaba (Tongyi), Hangzhou' },
  kwaipilot: { evidence: "Kuaishou's KwaiPilot team, Beijing" },
  // Pre-seeded: not in the ranked window on the version date.
  baidu: { evidence: 'Baidu (ERNIE), Beijing' },
  '01-ai': { evidence: '01.AI, Beijing' },
  thudm: { evidence: 'Tsinghua KEG / Zhipu (GLM), Beijing' },
  internlm: { evidence: 'Shanghai AI Laboratory (InternLM), Shanghai' },
  opengvlab: { evidence: 'Shanghai AI Laboratory (InternVL), Shanghai' },
  bytedance: { evidence: 'ByteDance, Beijing' },
  meituan: { evidence: 'Meituan (LongCat), Beijing' },
  openbmb: { evidence: 'OpenBMB, Tsinghua NLP / ModelBest, Beijing' },
}

/**
 * Every other author seen in the open-weight seed list on the version date,
 * so an author absent from BOTH lists is genuinely new rather than merely
 * unrecorded. Plus a pre-seeded set of well-known non-Chinese labs.
 *
 * NOT LISTED, DELIBERATELY: `nex-agi` (Nex-N2-Pro, DeepSeek-V3.1-Nex-N1),
 * which IS in the open-weight seed list. The company's headquarters could
 * not be established with confidence when this list was written (2026-09-02,
 * without network access), and the rule is to list an author in the PR for a
 * human to place rather than default it either way. Until it is placed, its
 * tokens are unknown to the Chinese-lab index: excluded from both sides,
 * named in every WARN, and a halt if they exceed the cap. Placing it is one
 * line in whichever list is right.
 */
export const KNOWN_NON_CHINESE_AUTHORS: Readonly<
  Record<string, AuthorEvidence>
> = {
  // Seen in the open-weight seed list.
  anthropic: { evidence: 'Anthropic, San Francisco, US' },
  openai: { evidence: 'OpenAI, San Francisco, US' },
  google: { evidence: 'Google (Gemini, Gemma), Mountain View, US' },
  'x-ai': { evidence: 'xAI (listed by OpenRouter as SpaceXAI), US' },
  meta: { evidence: 'Meta, Menlo Park, US' },
  'meta-llama': { evidence: 'Meta (Llama), Menlo Park, US' },
  nvidia: { evidence: 'NVIDIA, Santa Clara, US' },
  mistralai: { evidence: 'Mistral AI, Paris, France' },
  microsoft: { evidence: 'Microsoft, Redmond, US' },
  cohere: { evidence: 'Cohere, Toronto, Canada' },
  amazon: { evidence: 'Amazon (Nova), Seattle, US' },
  perplexity: { evidence: 'Perplexity, San Francisco, US' },
  poolside: { evidence: 'Poolside AI, Paris / US' },
  'arcee-ai': { evidence: 'Arcee AI, San Francisco, US' },
  tngtech: { evidence: 'TNG Technology Consulting, Munich, Germany' },
  upstage: { evidence: 'Upstage, Seoul, South Korea' },
  intfloat: {
    evidence:
      "Microsoft's E5 embedding family, published under a researcher account; Microsoft, US",
  },
  'sentence-transformers': {
    evidence: 'UKP Lab, TU Darmstadt / Hugging Face community, Germany',
  },
  openrouter: {
    evidence:
      'OpenRouter cloaked pre-release slugs: publisher unknown by design; denominator only, never numerator, forward-only if unmasked',
  },
  // Pre-seeded: not in the ranked window on the version date.
  ai21: { evidence: 'AI21 Labs, Tel Aviv, Israel' },
  liquid: { evidence: 'Liquid AI, Boston, US' },
  nousresearch: { evidence: 'Nous Research, US' },
  allenai: { evidence: 'Allen Institute for AI, Seattle, US' },
  'ibm-granite': { evidence: 'IBM, Armonk, US' },
  writer: { evidence: 'Writer, San Francisco, US' },
  inception: { evidence: 'Inception Labs, Palo Alto, US' },
  eleutherai: { evidence: 'EleutherAI, US non-profit' },
}

/**
 * The author segment of a permaslug, or null when the slug is not a valid
 * `owner/model` key after stripping the variant suffix.
 */
export const authorOfPermaslug = (permaslug: string): string | null => {
  const base = basePermaslug(permaslug)
  if (!isValidPermaslug(base)) return null
  return base.slice(0, base.indexOf('/'))
}

export type LabShareFeed = 'anthropic' | 'chinese-lab'

export type LabShareAuthorLists = {
  chinese: Readonly<Record<string, AuthorEvidence>>
  nonChinese: Readonly<Record<string, AuthorEvidence>>
}

export const DEFAULT_LAB_SHARE_AUTHOR_LISTS: LabShareAuthorLists = {
  chinese: CHINESE_LAB_AUTHORS,
  nonChinese: KNOWN_NON_CHINESE_AUTHORS,
}

/** Parallel to OpenWeightShareResult. */
export type LabShareResult = {
  feed: LabShareFeed
  /** 0-100, or null when nothing classified or any row is malformed. */
  share: number | null
  /** UTC dates actually included, oldest first. */
  dates: string[]
  /** Rows in the window whose token count could not be parsed. */
  invalidTokenRows: string[]
  /** Rows in the window whose permaslug is not `owner/model`. */
  malformedSlugs: string[]
  /** True when the aggregated `other` row is present in the payload. */
  hasExcludedPayload: boolean
  /**
   * Authors in neither list (Chinese-lab feed only; always empty for the
   * Anthropic feed), and their volume as U/C — the quantity
   * UNKNOWN_AUTHOR_TOKEN_SHARE_CAP bounds.
   */
  unknownAuthors: string[]
  unknownTokens: number
  unknownShareOfClassified: number
  /** Token counts, as doubles — display/telemetry only, never the divisor. */
  numeratorTokens: number
  classifiedTokens: number
  otherTokens: number
  compositeSlugs: string[]
  compositeTokens: number
  payloadTokens: number
}

type AuthorVerdict = 'in' | 'out' | 'unknown'

const classifyAuthor = (
  feed: LabShareFeed,
  author: string,
  lists: LabShareAuthorLists
): AuthorVerdict => {
  if (feed === 'anthropic') return author === ANTHROPIC_AUTHOR ? 'in' : 'out'
  if (lists.chinese[author]) return 'in'
  if (lists.nonChinese[author]) return 'out'
  return 'unknown'
}

/**
 * The index. Percentage of tokens, among the top-50 models over the trailing
 * window, attributed to the feed's authors.
 *
 * Summed as BigInt for the same reason the open-weight index is: the 7-day
 * aggregate runs past Number.MAX_SAFE_INTEGER.
 */
export const computeLabShare = (
  feed: LabShareFeed,
  allRows: RankingRow[],
  days = OPEN_WEIGHT_WINDOW_DAYS,
  lists: LabShareAuthorLists = DEFAULT_LAB_SHARE_AUTHOR_LISTS
): LabShareResult => {
  const dates = newestWindowDates(allRows, days)
  const inWindow: Record<string, true> = {}
  for (const d of dates) inWindow[d] = true
  const rows = allRows.filter((r) => inWindow[r.date])

  let numeratorTokens = 0n
  let classifiedTokens = 0n
  let unknownTokens = 0n
  let otherTokens = 0n
  let compositeTokens = 0n
  let payloadTokens = 0n
  const unknownSet: Record<string, true> = {}
  const compositeSet: Record<string, true> = {}
  const invalidTokenRowSet: Record<string, true> = {}
  const malformedSlugSet: Record<string, true> = {}

  for (const row of rows) {
    const tokens = parseTokens(row.total_tokens)
    if (tokens == null) {
      invalidTokenRowSet[`${row.date}:${row.model_permaslug}`] = true
      continue
    }
    payloadTokens += tokens

    // `other` is unclassifiable by construction — never in the denominator.
    if (basePermaslug(row.model_permaslug) === OTHER_MODEL_KEY) {
      otherTokens += tokens
      continue
    }

    // Routers and floating aliases are not one publisher's model. Out of both
    // sides, and recorded so the caller can log the volume.
    if (isCompositeSlug(row.model_permaslug)) {
      compositeSet[basePermaslug(row.model_permaslug)] = true
      compositeTokens += tokens
      continue
    }

    const author = authorOfPermaslug(row.model_permaslug)
    if (author == null) {
      malformedSlugSet[row.model_permaslug] = true
      continue
    }

    const verdict = classifyAuthor(feed, author, lists)
    if (verdict === 'unknown') {
      unknownSet[author] = true
      unknownTokens += tokens
      continue
    }
    classifiedTokens += tokens
    if (verdict === 'in') numeratorTokens += tokens
  }

  const invalidTokenRows = Object.keys(invalidTokenRowSet).sort()
  const malformedSlugs = Object.keys(malformedSlugSet).sort()
  const share =
    classifiedTokens > 0n &&
    invalidTokenRows.length === 0 &&
    malformedSlugs.length === 0
      ? Number((numeratorTokens * 100n * LAB_SHARE_SCALE) / classifiedTokens) /
        Number(LAB_SHARE_SCALE)
      : null

  return {
    feed,
    share,
    dates,
    invalidTokenRows,
    malformedSlugs,
    hasExcludedPayload: otherTokens > 0n,
    unknownAuthors: Object.keys(unknownSet).sort(),
    unknownTokens: finiteBigIntTelemetry(unknownTokens),
    unknownShareOfClassified: ratioOfBigInts(unknownTokens, classifiedTokens),
    numeratorTokens: finiteBigIntTelemetry(numeratorTokens),
    classifiedTokens: finiteBigIntTelemetry(classifiedTokens),
    otherTokens: finiteBigIntTelemetry(otherTokens),
    compositeSlugs: Object.keys(compositeSet).sort(),
    compositeTokens: finiteBigIntTelemetry(compositeTokens),
    payloadTokens: finiteBigIntTelemetry(payloadTokens),
  }
}

export const computeAnthropicShare = (
  rows: RankingRow[],
  days = OPEN_WEIGHT_WINDOW_DAYS
): LabShareResult => computeLabShare('anthropic', rows, days)

export const computeChineseLabShare = (
  rows: RankingRow[],
  days = OPEN_WEIGHT_WINDOW_DAYS,
  lists: LabShareAuthorLists = DEFAULT_LAB_SHARE_AUTHOR_LISTS
): LabShareResult => computeLabShare('chinese-lab', rows, days, lists)

const LAB_SHARE_SCALE = 1_000_000_000n

const ratioOfBigInts = (numerator: bigint, denominator: bigint): number =>
  denominator > 0n
    ? Number((numerator * LAB_SHARE_SCALE) / denominator) /
      Number(LAB_SHARE_SCALE)
    : 0

const finiteBigIntTelemetry = (value: bigint) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Number.MAX_VALUE
}

/** Same rule as the open-weight index: truncate a fractional count, reject anything else. */
const parseTokens = (raw: string): bigint | null => {
  if (typeof raw !== 'string') return null
  const m = /^(\d+)(?:\.\d+)?$/.exec(raw.trim())
  return m ? BigInt(m[1]) : null
}

export type LabSharePublicationValidation =
  | {
      ok: true
      share: number
      /** Unknown authors published under the cap — never silent. */
      unknownAuthors: string[]
      unknownShareOfClassified: number
    }
  | { ok: false; reason: string }

export type LabSharePublicationOptions = {
  expectedDays?: number
  /** Override the cap; 0 halts on ANY unknown author. */
  unknownShareCap?: number
  /** Bound on router/alias tokens; defaults to COMPOSITE_TOKEN_SHARE_CAP. */
  compositeShareCap?: number
}

/**
 * Fail-closed publication gate shared by the live writer and the backfill,
 * parallel to validateOpenWeightPublication. Structural checks (malformed
 * rows, malformed slugs, incomplete or gapped window, missing `other`,
 * composite volume) run first for BOTH feeds; the unknown-author decision
 * applies only to the Chinese-lab feed, whose result is the only one that can
 * carry unknowns.
 */
export const validateLabSharePublication = (
  result: LabShareResult,
  options: LabSharePublicationOptions = {}
): LabSharePublicationValidation => {
  const {
    expectedDays = OPEN_WEIGHT_WINDOW_DAYS,
    unknownShareCap = UNKNOWN_AUTHOR_TOKEN_SHARE_CAP,
    compositeShareCap = COMPOSITE_TOKEN_SHARE_CAP,
  } = options

  if (result.invalidTokenRows.length > 0)
    return {
      ok: false,
      reason: `malformed token count rows: ${result.invalidTokenRows.join(
        ', '
      )}`,
    }
  if (result.malformedSlugs.length > 0)
    return {
      ok: false,
      reason: `malformed model slugs: ${result.malformedSlugs.join(', ')}`,
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
      return { ok: false, reason: `invalid window date: ${invalidDate}` }
    }
    if (current - previous !== DAY_MS)
      return {
        ok: false,
        reason: `non-consecutive window dates: ${result.dates.join(', ')}`,
      }
  }
  if (!result.hasExcludedPayload)
    return { ok: false, reason: 'payload has no excluded `other` tokens' }
  if (
    result.share == null ||
    !Number.isFinite(result.share) ||
    result.share < 0 ||
    result.share > 100
  )
    return { ok: false, reason: `invalid share ${result.share}` }
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

  if (result.unknownAuthors.length === 0)
    return {
      ok: true,
      share: result.share,
      unknownAuthors: [],
      unknownShareOfClassified: 0,
    }

  const w = result.unknownShareOfClassified
  if (!Number.isFinite(w) || w > unknownShareCap)
    return {
      ok: false,
      reason:
        `unknown author(s) ${result.unknownAuthors.join(', ')} hold ${(
          w * 100
        ).toFixed(3)}% of classified tokens, over the ${(
          unknownShareCap * 100
        ).toFixed(3)}% cap; add to CHINESE_LAB_AUTHORS or ` +
        `KNOWN_NON_CHINESE_AUTHORS`,
    }
  return {
    ok: true,
    share: result.share,
    unknownAuthors: result.unknownAuthors,
    unknownShareOfClassified: w,
  }
}
