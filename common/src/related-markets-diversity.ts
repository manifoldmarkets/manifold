import { Contract } from './contract'

// Related markets are ranked by embedding similarity × importance, so a
// creator who scripts dozens of markets from one template ("Will China
// restrict exports of <element> on December 31, 2026?") can fill every slot
// on every nearby page with variants of one question. Two cheap, deterministic
// passes keep the list varied: collapse near-duplicate questions, then cap how
// many results one creator can take while other creators' markets are
// available.

type DiversityCandidate = Pick<Contract, 'id' | 'question' | 'creatorId'>
type DiversitySource = Pick<Contract, 'question' | 'creatorId'>

/** Candidates fetched from the embedding index per request. A templated
 * series can hold 60+ near-identical markets that all outrank everything
 * else, so the pool must be deep enough that collapsing it leaves something
 * to show. */
export const RELATED_MARKETS_CANDIDATE_POOL = 150

/** Share of the returned list one creator may take while markets from other
 * creators are available to fill it. */
const MAX_CREATOR_SHARE = 0.4

/** At least this many shared tokens before two questions can count as one
 * template; shorter overlaps are coincidences ("Will X win the 2028 ..."). */
const MIN_SHARED_TOKENS = 6
const MIN_SHARED_RATIO = 0.6
/** A slot is the run of tokens that differs between two variants. */
const MAX_SLOT_TOKENS = 3
const MAX_INSERTED_SLOT_TOKENS = 6
const MAX_SLOTS = 3
/** A worded variant collapses only inside a series this large (other
 * same-creator questions sharing its template). */
const SERIES_MIN_VARIANTS = 3

const STOPWORDS = new Set(['a', 'an', 'the', 'will', 'be', 'is', 'are'])
const MONTHS = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
])

// A season spanning two consecutive years: "2026-27", "2026/2027".
const isSeason = (token: string) => {
  const match = /^((?:19|20)\d\d)[-/](\d\d|\d{4})$/.exec(token)
  if (!match) return false
  const next = Number(match[1]) + 1
  return match[2].length === 2
    ? Number(match[2]) === next % 100
    : Number(match[2]) === next
}
const isYearOrSeason = (token: string) =>
  /^(19|20)\d\d$/.test(token) || isSeason(token)
const isNumberLike = (token: string) =>
  /^-?\d+(\.\d+)?$/.test(token) ||
  isYearOrSeason(token) ||
  /^\d+(st|nd|rd|th)$/.test(token) ||
  /^[qh][1-4]$/.test(token) ||
  MONTHS.has(token)
// A number right after one of these is a threshold, not a year: "$2,000",
// "above 1950", "> 2030".
const THRESHOLD_CONTEXT = new Set([
  '$',
  '€',
  '£',
  '>',
  '<',
  '>=',
  '<=',
  '=',
  'above',
  'below',
  'over',
  'under',
  'exceed',
  'exceeds',
  'than',
  'least',
  'most',
  'reach',
  'reaches',
  'hit',
  'hits',
  'top',
  'tops',
  'surpass',
  'between',
])

/** Lowercased tokens of a question: words, numbers (signed, decimals and
 * seasons kept whole), comparison operators and currency or percent signs,
 * which change the question. Diacritics, possessives, other punctuation and
 * thousands separators are dropped so cosmetic differences don't hide a
 * duplicate. */
export const questionTokens = (question: string): string[] =>
  (
    question
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/['’]s\b/g, '')
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
      .replace(/[−–—]/g, '-')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=')
      .match(
        /(?:19|20)\d\d[-/]\d{2,4}(?!\d)|[<>]=?|=|[$€£%]|(?<![\p{L}\p{N}.])-\d+(?:\.\d+)*|[\p{L}\p{N}]+(?:\.\p{N}+)*/gu
      ) ?? []
  ).flatMap((token) =>
    // "2026-11" is not a season: keep its parts separate.
    /^\d{4}[-/]\d+$/.test(token) && !isSeason(token)
      ? token.split(/[-/]/)
      : [token]
  )

/** Same question up to articles, auxiliaries and punctuation. */
const duplicateKey = (tokens: readonly string[]) =>
  tokens.filter((token) => !STOPWORDS.has(token)).join(' ')

/** A run of tokens that differs between two variants, with the shared token
 * just before it (for telling a date's year from an edition's year). */
type Slot = { a: string[]; b: string[]; before: string[] }

type RawSlot = Slot & { sharedAfter: string[] }

/** Longest-common-subsequence alignment of two token lists, returned as the
 * runs of tokens that differ between them (the template's slots). Two
 * insertions into the same question split by one shared token are one slot:
 * "gallium" vs "arsenic trichloride or gallium arsenide" is one substitution
 * that the alignment happens to anchor on "gallium". */
const differingSlots = (a: readonly string[], b: readonly string[]) => {
  const n = a.length
  const m = b.length
  // lcs(i, j) = LCS length of a[i..] and b[j..], in one flat table.
  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  const lcs = (i: number, j: number) => table[i * width + j]
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * width + j] =
        a[i] === b[j]
          ? lcs(i + 1, j + 1) + 1
          : Math.max(lcs(i + 1, j), lcs(i, j + 1))

  const raw: RawSlot[] = []
  let current: RawSlot | undefined
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      if (current) current.sharedAfter.push(a[i])
      i++
      j++
      continue
    }
    if (!current || current.sharedAfter.length > 0) {
      current = {
        a: [],
        b: [],
        before: a.slice(Math.max(0, i - 2), i),
        sharedAfter: [],
      }
      raw.push(current)
    }
    if (j >= m || (i < n && lcs(i + 1, j) >= lcs(i, j + 1)))
      current.a.push(a[i++])
    else current.b.push(b[j++])
  }

  const slots: Slot[] = []
  let previous: RawSlot | undefined
  for (const slot of raw) {
    const sameSideInserts =
      previous &&
      previous.sharedAfter.length === 1 &&
      ((previous.a.length === 0 && slot.a.length === 0) ||
        (previous.b.length === 0 && slot.b.length === 0))
    if (previous && sameSideInserts) {
      const merged: RawSlot = {
        a: [...previous.a, ...previous.sharedAfter, ...slot.a],
        b: [...previous.b, ...previous.sharedAfter, ...slot.b],
        before: previous.before,
        sharedAfter: slot.sharedAfter,
      }
      slots[slots.length - 1] = merged
      previous = merged
    } else {
      slots.push(slot)
      previous = slot
    }
  }
  return { shared: lcs(0, 0), slots }
}

const isNumericSlot = ({ a, b }: Slot) => [...a, ...b].every(isNumberLike)

// "2026" vs "2030", or a season "2026-27" vs "2027-28": a different edition or
// horizon of an event, which is a different market, not a duplicate. A year
// that completes a date ("December 31, 2026" vs "December 31, 2027") is a
// checkpoint of the same question instead, and a number after "$" or "above"
// is a threshold that happens to look like a year.
const isEditionSlot = ({ a, b, before }: Slot) =>
  a.length === 1 &&
  b.length === 1 &&
  isYearOrSeason(a[0]) &&
  isYearOrSeason(b[0]) &&
  !before.some((token) => MONTHS.has(token)) &&
  !THRESHOLD_CONTEXT.has(before[before.length - 1] ?? '')

/** How two questions relate as variants of one template, if they do: they
 * share a long frame and differ in numeric slots only (a threshold, a
 * checkpoint date: 'numeric'), or in one worded slot (the subject, "gallium"
 * vs "indium") plus any numeric slots ('worded'). Differing only in a bare
 * year is a different edition ("before 2027" vs "before 2030") and is not a
 * variant. */
export const templateVariantKind = (
  first: readonly string[],
  second: readonly string[]
) => variantKind(prepare(first), prepare(second))

/** Per-question data reused across the pairwise comparisons. */
type PreparedQuestion = {
  tokens: readonly string[]
  text: string
  tokenSet: ReadonlySet<string>
}
const prepare = (tokens: readonly string[]): PreparedQuestion => ({
  tokens,
  text: tokens.join(' '),
  tokenSet: new Set(tokens),
})

const variantKind = (
  first: PreparedQuestion,
  second: PreparedQuestion
): 'numeric' | 'worded' | undefined => {
  // The alignment breaks ties by position, so fix the argument order to keep
  // the relation symmetric.
  const [x, y] =
    first.tokens.length < second.tokens.length ||
    (first.tokens.length === second.tokens.length && first.text <= second.text)
      ? [first, second]
      : [second, first]
  const a = x.tokens
  const b = y.tokens
  const longer = Math.max(a.length, b.length)
  if (Math.min(a.length, b.length) < MIN_SHARED_TOKENS) return undefined
  if (Math.abs(a.length - b.length) > MAX_INSERTED_SLOT_TOKENS) return undefined
  // Cheap upper bound on the alignment before paying for it.
  let sharedAtMost = 0
  for (const token of a) if (y.tokenSet.has(token)) sharedAtMost++
  if (
    sharedAtMost < MIN_SHARED_TOKENS ||
    sharedAtMost / longer < MIN_SHARED_RATIO
  )
    return undefined

  const { shared, slots } = differingSlots(a, b)
  if (shared < MIN_SHARED_TOKENS || shared / longer < MIN_SHARED_RATIO)
    return undefined
  if (slots.length === 0 || slots.length > MAX_SLOTS) return undefined
  if (slots.every(isEditionSlot)) return undefined
  const fits = slots.every(
    ({ a, b }) =>
      Math.min(a.length, b.length) <= MAX_SLOT_TOKENS &&
      Math.max(a.length, b.length) <= MAX_INSERTED_SLOT_TOKENS
  )
  if (!fits) return undefined
  const wordedSlots = slots.filter((slot) => !isNumericSlot(slot)).length
  return wordedSlots === 0
    ? 'numeric'
    : wordedSlots === 1
    ? 'worded'
    : undefined
}

/** Drop candidates that repeat the source or an earlier (better-ranked)
 * candidate, keeping rank order and the first of each group:
 * - the same question from anyone;
 * - from the same creator, a numeric variant (another threshold or
 *   checkpoint date of the same question);
 * - from the same creator, a worded variant that belongs to a series: at
 *   least SERIES_MIN_VARIANTS other questions by that creator among the
 *   source and candidates share its template. A lone pair ("Republican
 *   nominee" vs "Democratic nominee") is two different markets; sixty
 *   "Will China restrict exports of <element>" markets are one.
 * Across creators only exact duplicates collapse, so independent markets that
 * happen to share wording stay. */
export const collapseNearDuplicateRelatedMarkets = <
  T extends DiversityCandidate
>(
  source: DiversitySource,
  candidates: readonly T[]
): T[] => {
  const sourceTokens = questionTokens(source.question)
  const tokens = candidates.map((candidate) =>
    questionTokens(candidate.question)
  )

  // Index -1 stands for the source.
  const preparedSource = prepare(sourceTokens)
  const prepared = tokens.map(prepare)
  const preparedOf = (i: number) => (i < 0 ? preparedSource : prepared[i])
  const kindCache = new Map<string, ReturnType<typeof variantKind>>()
  const kindOf = (i: number, j: number) => {
    const cacheKey = i < j ? `${i}:${j}` : `${j}:${i}`
    if (!kindCache.has(cacheKey))
      kindCache.set(cacheKey, variantKind(preparedOf(i), preparedOf(j)))
    return kindCache.get(cacheKey)
  }
  const creatorGroups = new Map<string, number[]>([[source.creatorId, [-1]]])
  candidates.forEach((candidate, i) => {
    const group = creatorGroups.get(candidate.creatorId)
    if (group) group.push(i)
    else creatorGroups.set(candidate.creatorId, [i])
  })
  // Counts the source too; stops as soon as the answer is known.
  const isInSeries = (i: number) => {
    let variants = 0
    for (const j of creatorGroups.get(candidates[i].creatorId) ?? []) {
      if (j !== i && kindOf(i, j)) variants++
      if (variants >= SERIES_MIN_VARIANTS) return true
    }
    return false
  }

  const seenKeys = new Set([duplicateKey(sourceTokens)])
  // Kept representatives by creator, the source standing in for its own.
  const keptByCreator = new Map<string, number[]>([[source.creatorId, [-1]]])
  const kept: T[] = []
  candidates.forEach((candidate, i) => {
    const key = duplicateKey(tokens[i])
    if (key.length === 0 || seenKeys.has(key)) return
    // A copy of a collapsed variant is as redundant as the variant itself.
    seenKeys.add(key)
    const representatives = keptByCreator.get(candidate.creatorId) ?? []
    let wordedVariant = false
    for (const r of representatives) {
      const kind = kindOf(i, r)
      if (kind === 'numeric') return
      if (kind === 'worded') wordedVariant = true
    }
    if (wordedVariant && isInSeries(i)) return
    representatives.push(i)
    keptByCreator.set(candidate.creatorId, representatives)
    kept.push(candidate)
  })
  return kept
}

/** 4 of 10 on a market page, 10 of 25 for the next-market prompt. Measured on
 * prod lists (2026-11-17): 3 of 10 dropped relevant same-creator markets that
 * had survived the collapse (an Alaska race page lost its own 2028 Alaska
 * Senate market); 5 let a year-by-year "AGI before <year>" ladder take half
 * the list. */
export const relatedMarketsMaxPerCreator = (limit: number) =>
  Math.max(1, Math.round(limit * MAX_CREATOR_SHARE))

/** Take up to `count` candidates in rank order, at most `maxPerCreator` from
 * any one creator. If that leaves the list short, fill it with the skipped
 * candidates in rank order: the cap reorders, it never shortens the list. */
export const capRelatedMarketsPerCreator = <
  T extends Pick<Contract, 'creatorId'>
>(
  candidates: readonly T[],
  count: number,
  maxPerCreator: number
): T[] => {
  const perCreator = new Map<string, number>()
  const withinCap: T[] = []
  const overCap: T[] = []
  for (const candidate of candidates) {
    if (withinCap.length >= count) break
    const taken = perCreator.get(candidate.creatorId) ?? 0
    if (taken < maxPerCreator) {
      perCreator.set(candidate.creatorId, taken + 1)
      withinCap.push(candidate)
    } else overCap.push(candidate)
  }
  return [...withinCap, ...overCap].slice(0, Math.max(0, count))
}

/** Near-duplicate collapse, then the per-creator cap, keeping rank order. */
export const diversifyRelatedMarkets = <T extends DiversityCandidate>(
  source: DiversitySource,
  candidates: readonly T[],
  count: number,
  maxPerCreator: number
): T[] =>
  capRelatedMarketsPerCreator(
    collapseNearDuplicateRelatedMarkets(source, candidates),
    count,
    maxPerCreator
  )
