// Opening-odds ("seed") math for the @ManifoldPolitics national markets.
//
// Everything here is pure and unit tested (national-markets.test.ts). Seeds
// come only from Manifold's own markets (the deepest community market for the
// same question, read at run time) or from documented static priors. We do
// not use Kalshi's prices or data.
//
// Units: source probabilities are fractions (0–1); seeds sent to the API are
// percentages (1–99), the unit `answerProbs` / `initialProb` take.

import { createHash } from 'crypto'

export const MIN_PCT = 1
export const MAX_PCT = 99

// ---------------------------------------------------------------------------
// Reserved ids
// ---------------------------------------------------------------------------

// The alphabet of common/src/util/random.ts (randomStringRegex accepts exactly
// these 62 characters). The create endpoint uses `idempotencyKey` as the new
// contract's id and refuses a second create with the same key, so a
// deterministic id per (series, key) makes every create safe to retry.
export const ID_ALPHABET =
  'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
export const RESERVED_ID_LENGTH = 10

export function reservedIdFor(series: string, key: string): string {
  const digest = createHash('sha256').update(`${series}\n${key}`).digest()
  let id = ''
  for (let i = 0; i < RESERVED_ID_LENGTH; i++)
    id += ID_ALPHABET[digest[i] % ID_ALPHABET.length]
  return id
}

// ---------------------------------------------------------------------------
// Candidate names
// ---------------------------------------------------------------------------

// Lowercase, no diacritics, no parentheticals ("JD Vance (Vice President)"),
// no periods/commas/quotes, hyphens as spaces, single spaces. "J.D. Vance" and
// "JD Vance" both become "jd vance".
export function normalizeName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[’‘'".,]/g, '')
    .replace(/[-–—_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Spaced initials: "j b pritzker" -> "jb pritzker", like "J.B. Pritzker".
    .replace(/\b([a-z]) (?=[a-z]\b)/g, '$1')
}

// Normalized variant -> display name, for the spellings community markets use.
// Anything not listed keeps its own (cleaned) spelling.
const DISPLAY_NAMES: Record<string, string> = {
  'jd vance': 'JD Vance',
  'james david vance': 'JD Vance',
  'ron desantis': 'Ron DeSantis',
  'donald trump': 'Donald Trump',
  'donald trump sr': 'Donald Trump',
  'donald j trump': 'Donald Trump',
  'donald j trump sr': 'Donald Trump',
  'donald john trump': 'Donald Trump',
  'donald trump jr': 'Donald Trump Jr.',
  'donald j trump jr': 'Donald Trump Jr.',
  'donald john trump jr': 'Donald Trump Jr.',
  'don jr': 'Donald Trump Jr.',
  'alexandria ocasio cortez': 'Alexandria Ocasio-Cortez',
  aoc: 'Alexandria Ocasio-Cortez',
  'jb pritzker': 'JB Pritzker',
  'robert f kennedy jr': 'Robert F. Kennedy Jr.',
  'robert f kennedy': 'Robert F. Kennedy Jr.',
  'rfk jr': 'Robert F. Kennedy Jr.',
  'john n kennedy': 'John N. Kennedy',
  'beto orourke': "Beto O'Rourke",
}

// Home state (postal code) of likely 2028 candidates, keyed by canonical name,
// for the state primary seeds. Only people who hold or held statewide or
// federal office there; anyone not listed gets no home-state boost.
export const HOME_STATES: Record<string, string> = {
  'gavin newsom': 'CA',
  'kamala harris': 'CA',
  'ro khanna': 'CA',
  'josh shapiro': 'PA',
  'john fetterman': 'PA',
  'andy beshear': 'KY',
  'gretchen whitmer': 'MI',
  'elissa slotkin': 'MI',
  'jb pritzker': 'IL',
  'jon ossoff': 'GA',
  'raphael warnock': 'GA',
  'mark kelly': 'AZ',
  'ruben gallego': 'AZ',
  'alexandria ocasio cortez': 'NY',
  'wes moore': 'MD',
  'chris van hollen': 'MD',
  'cory booker': 'NJ',
  'phil murphy': 'NJ',
  'chris murphy': 'CT',
  'tim walz': 'MN',
  'amy klobuchar': 'MN',
  'roy cooper': 'NC',
  'josh stein': 'NC',
  'jared polis': 'CO',
  'james talarico': 'TX',
  'jasmine crockett': 'TX',
  'beto orourke': 'TX',
  'bernie sanders': 'VT',
  'elizabeth warren': 'MA',
  'jd vance': 'OH',
  'vivek ramaswamy': 'OH',
  'marco rubio': 'FL',
  'ron desantis': 'FL',
  'byron donalds': 'FL',
  'thomas massie': 'KY',
  'rand paul': 'KY',
  'brian kemp': 'GA',
  'marjorie taylor greene': 'GA',
  'glenn youngkin': 'VA',
  'ted cruz': 'TX',
  'greg abbott': 'TX',
  'josh hawley': 'MO',
  'nikki haley': 'SC',
  'tim scott': 'SC',
  'sarah huckabee sanders': 'AR',
  'tom cotton': 'AR',
  'kristi noem': 'SD',
  'elise stefanik': 'NY',
  'doug burgum': 'ND',
}

// Answers that name no person: "Other", "No 2028 Election", "No one", …
const NON_CANDIDATE =
  /^(others?|no one|noone|nobody|none|none of the above|none of these candidates|no (\d{4} )?(us )?(presidential )?election|someone else|anyone else|n a|na|uncommitted|undecided)$/

// Moderator placeholders such as "[Invalid entry - Will resolve NO]".
const PLACEHOLDER = /[[\]{}]|\b(invalid|resolves?|duplicate|placeholder)\b/i

export const isNonCandidate = (text: string) =>
  PLACEHOLDER.test(text) || NON_CANDIDATE.test(normalizeName(text))

const cleanDisplay = (text: string) =>
  text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// The display name and the merge key for a candidate answer, or undefined for
// an answer that names no person.
export function canonicalCandidate(
  text: string
): { key: string; display: string } | undefined {
  if (isNonCandidate(text)) return undefined
  const norm = normalizeName(text)
  if (!norm) return undefined
  const display = DISPLAY_NAMES[norm] ?? cleanDisplay(text)
  return { key: normalizeName(display), display }
}

// ---------------------------------------------------------------------------
// Percent bookkeeping
// ---------------------------------------------------------------------------

const round1 = (x: number) => Math.round(x * 10) / 10
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const clampPct = (p: number) => Math.min(MAX_PCT, Math.max(MIN_PCT, p))

// Listed answers' percentages for a market with an "Other" answer: each in
// [1, 99] with one decimal, and together at most 100 - otherMin, so "Other"
// (which the API gives the remainder) never opens below otherMin. When the
// inputs leave too little room, only the part of each answer above the 1%
// floor is scaled down, so no answer drops under the floor.
export function fitWithOther(pcts: number[], otherMin = MIN_PCT): number[] {
  if (pcts.some((p) => !Number.isFinite(p)))
    throw new Error('fitWithOther: non-finite percentage')
  const cap = 100 - otherMin
  if (pcts.length * MIN_PCT > cap)
    throw new Error(
      `fitWithOther: ${pcts.length} answers at ${MIN_PCT}% leave less than ${otherMin}% for Other`
    )
  let out = pcts.map(clampPct)
  const total = sum(out)
  if (total > cap) {
    const excess = sum(out.map((p) => p - MIN_PCT))
    const room = cap - out.length * MIN_PCT
    const k = excess > 0 ? room / excess : 0
    out = out.map((p) => MIN_PCT + (p - MIN_PCT) * k)
  }
  out = out.map((p) => Math.max(MIN_PCT, round1(p)))
  // Rounding up can push the total over the cap by a few tenths; take them
  // from the largest answer.
  let drift = round1(sum(out) - cap)
  while (drift > 0) {
    const i = out.indexOf(Math.max(...out))
    const take = Math.min(drift, out[i] - MIN_PCT)
    if (take <= 0) throw new Error('fitWithOther: cannot fit under the cap')
    out[i] = round1(out[i] - take)
    drift = round1(sum(out) - cap)
  }
  return out
}

// Percentages for a fixed set of answers that sum to exactly 100 (one
// decimal), each at least floorPct. Answers under the floor are raised to it
// and the rest are scaled down proportionally, repeating until stable.
export function floorAndNormalize(
  probs: number[],
  floorPct = MIN_PCT
): number[] {
  if (probs.length === 0) return []
  if (probs.some((p) => !Number.isFinite(p) || p < 0))
    throw new Error('floorAndNormalize: invalid probability')
  if (probs.length * floorPct > 100)
    throw new Error('floorAndNormalize: floor too high for the answer count')
  const total = sum(probs)
  let pcts = probs.map((p) =>
    total > 0 ? (p / total) * 100 : 100 / probs.length
  )
  for (let iter = 0; iter < 50; iter++) {
    const floored = pcts.map((p) => p <= floorPct)
    const fixed = floored.filter(Boolean).length * floorPct
    const free = sum(pcts.filter((_, i) => !floored[i]))
    const target = 100 - fixed
    const next = pcts.map((p, i) =>
      floored[i] ? floorPct : free > 0 ? (p * target) / free : floorPct
    )
    const stable = next.every((p, i) => floored[i] || p > floorPct)
    pcts = next
    if (stable) break
  }
  let out = pcts.map((p) => Math.max(floorPct, round1(p)))
  // Make the rounded total exactly 100 by adjusting the largest answer.
  const drift = round1(100 - sum(out))
  if (drift !== 0) {
    const i = out.indexOf(Math.max(...out))
    out[i] = round1(out[i] + drift)
  }
  if (out.some((p) => p < MIN_PCT || p > MAX_PCT))
    throw new Error('floorAndNormalize: result outside [1, 99]')
  return out
}

// ---------------------------------------------------------------------------
// Seeds from community markets
// ---------------------------------------------------------------------------

export type SourceAnswer = {
  text: string
  probability: number
  isOther?: boolean
}

export type CandidateSeed = { text: string; pct: number }
export type CandidateSeeds = { seeds: CandidateSeed[]; otherPct: number }

type Weighted = { key: string; display: string; p: number }

// Merge a market's candidate answers by canonical name (a market can list one
// person twice under different spellings), dropping "Other" and non-people.
export function candidateWeights(answers: SourceAnswer[]): Weighted[] {
  const byKey = new Map<string, Weighted & { best: number }>()
  for (const a of answers) {
    if (a.isOther) continue
    const p = Number(a.probability)
    if (!Number.isFinite(p) || p <= 0) continue
    const c = canonicalCandidate(a.text)
    if (!c) continue
    const prev = byKey.get(c.key)
    if (prev) {
      prev.p += p
      if (p > prev.best) {
        prev.best = p
        prev.display = c.display
      }
    } else byKey.set(c.key, { ...c, p, best: p })
  }
  return [...byKey.values()]
    .map(({ key, display, p }) => ({ key, display, p }))
    .sort((a, b) => b.p - a.p)
}

// Opening odds copied from a community market: the people at or above
// minProb (most likely first, at most maxAnswers), each clamped to [1, 99];
// everything else (the source's "Other" and its long tail) goes to our
// "Other", which opens at no less than 1%.
export function candidateSeeds(
  answers: SourceAnswer[],
  opts: { minProb?: number; maxAnswers?: number } = {}
): CandidateSeeds {
  const minProb = opts.minProb ?? 0.01
  const maxAnswers = opts.maxAnswers ?? 20
  const kept = candidateWeights(answers)
    .filter((w) => w.p >= minProb)
    .slice(0, maxAnswers)
  return toCandidateSeeds(kept)
}

function toCandidateSeeds(kept: Weighted[]): CandidateSeeds {
  const pcts = fitWithOther(kept.map((w) => w.p * 100))
  const seeds = kept.map((w, i) => ({ text: w.display, pct: pcts[i] }))
  return { seeds, otherPct: round1(100 - sum(pcts)) }
}

export type PartyShares = { dem: number; rep: number; other: number }

// Democratic / Republican / everything else from a party market, tolerant of
// "Democrats", "The Democratic Party", "Republicans", …
export function partyShares(answers: SourceAnswer[]): PartyShares {
  let dem = 0
  let rep = 0
  let total = 0
  for (const a of answers) {
    const p = Number(a.probability)
    if (!Number.isFinite(p) || p < 0) continue
    total += p
    if (/democrat/i.test(a.text)) dem += p
    else if (/republican/i.test(a.text)) rep += p
  }
  if (total <= 0 || dem + rep <= 0)
    throw new Error('partyShares: no Democratic/Republican answers')
  return { dem: dem / total, rep: rep / total, other: 1 - (dem + rep) / total }
}

// Who will be elected vice president: each running mate's chance of being
// nominated times their party's chance of winning the presidency,
// P(X) = P(X is the D VP nominee)·P(D) + P(X is the R VP nominee)·P(R).
// Candidates come from both VP-nominee markets (at or above minProb there);
// a derived chance under minProb leaves the person to "Other".
export function derivedVpSeeds(
  demVp: SourceAnswer[],
  repVp: SourceAnswer[],
  party: PartyShares,
  opts: { minProb?: number; maxAnswers?: number } = {}
): CandidateSeeds {
  const minProb = opts.minProb ?? 0.01
  const maxAnswers = opts.maxAnswers ?? 24
  const combined = new Map<string, Weighted>()
  const add = (ws: Weighted[], partyP: number) => {
    for (const w of ws) {
      if (w.p < minProb) continue
      const prev = combined.get(w.key)
      if (prev) prev.p += w.p * partyP
      else combined.set(w.key, { ...w, p: w.p * partyP })
    }
  }
  add(candidateWeights(demVp), party.dem)
  add(candidateWeights(repVp), party.rep)
  const kept = [...combined.values()]
    .filter((w) => w.p >= minProb)
    .sort((a, b) => b.p - a.p)
    .slice(0, maxAnswers)
  return toCandidateSeeds(kept)
}

// An early-state contest's field from the national nominee market, flattened
// (weights ∝ p^power, power < 1) because one state is more of a coin flip
// than the nomination. The source's unnamed mass ("Other", non-people) is one
// more weight flattened the same way. The top maxAnswers people are listed;
// everyone else, flattened, stays in our "Other".
export function flattenedSeeds(
  nominee: SourceAnswer[],
  power = 0.8,
  maxAnswers = 12,
  // Favorite sons and daughters: a candidate from the contest's own state
  // gets this multiple of their flattened weight.
  home?: { state: string; boost: number }
): CandidateSeeds {
  if (!(power > 0 && power <= 1)) throw new Error('flattenedSeeds: bad power')
  if (home && !(home.boost >= 1)) throw new Error('flattenedSeeds: bad boost')
  const people = candidateWeights(nominee)
  const unnamed = Math.max(0, 1 - sum(people.map((w) => w.p)))
  const boostOf = (key: string) =>
    home && HOME_STATES[key] === home.state ? home.boost : 1
  const weights = people.map((w) => ({
    ...w,
    w: Math.pow(w.p, power) * boostOf(w.key),
  }))
  const total = sum(weights.map((w) => w.w)) + Math.pow(unnamed, power)
  if (!(total > 0)) throw new Error('flattenedSeeds: empty field')
  const kept = weights
    .map((w) => ({ key: w.key, display: w.display, p: w.w / total }))
    .sort((a, b) => b.p - a.p)
    .slice(0, maxAnswers)
    .filter((w) => w.p > 0)
  return toCandidateSeeds(kept)
}

// Two-answer party market (Democratic Party, Republican Party) from a binary
// whose YES is one of the parties.
export function binaryPartySeeds(
  yesProb: number,
  yesParty: 'Democratic Party' | 'Republican Party'
): { dem: number; rep: number } {
  if (!Number.isFinite(yesProb)) throw new Error('binaryPartySeeds: bad prob')
  const yes = clampPct(round1(yesProb * 100))
  const no = round1(100 - yes)
  return yesParty === 'Republican Party'
    ? { dem: no, rep: yes }
    : { dem: yes, rep: no }
}

// Two-answer party market from a party multi's Democratic and Republican
// shares (anything else is dropped and the two are renormalized).
export function twoPartySeeds(shares: PartyShares): {
  dem: number
  rep: number
} {
  const [dem, rep] = floorAndNormalize([shares.dem, shares.rep])
  return { dem, rep }
}

// Three-answer party market (D / R / another party or independent) with the
// third answer at otherPct and D and R splitting the rest in their ratio.
export function threePartySeeds(
  shares: PartyShares,
  otherPct = MIN_PCT
): { dem: number; rep: number; other: number } {
  const twoParty = shares.dem + shares.rep
  if (!(twoParty > 0)) throw new Error('threePartySeeds: no two-party share')
  if (!(otherPct >= MIN_PCT && otherPct <= 100 - 2 * MIN_PCT))
    throw new Error('threePartySeeds: bad otherPct')
  const room = 100 - otherPct
  // Keep both major parties inside [1, room - 1] so neither opens under 1%.
  const dem = Math.min(
    room - MIN_PCT,
    Math.max(MIN_PCT, round1((shares.dem / twoParty) * room))
  )
  const rep = round1(room - dem)
  return { dem, rep, other: round1(100 - dem - rep) }
}

// ---------------------------------------------------------------------------
// Normal-distribution buckets
// ---------------------------------------------------------------------------

// Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf approximation
// (|error| ≤ 1.5e-7, ample for opening odds).
export function normCdf(x: number): number {
  if (x === Infinity) return 1
  if (x === -Infinity) return 0
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-z * z)
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

// Inverse standard normal CDF (Acklam's algorithm, relative error < 1.2e-9).
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`normInv: p must be in (0, 1), got ${p}`)
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ]
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ]
  const plow = 0.02425
  const phigh = 1 - plow
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

export type Bucket = { label: string; lo: number; hi: number }

// Electoral votes for the Democratic nominee. Integer counts, so the edges sit
// on half votes: "270–299" is [269.5, 299.5).
export const EV_BUCKETS: Bucket[] = [
  { label: 'Under 200', lo: -Infinity, hi: 199.5 },
  { label: '200–229', lo: 199.5, hi: 229.5 },
  { label: '230–269', lo: 229.5, hi: 269.5 },
  { label: '270–299', lo: 269.5, hi: 299.5 },
  { label: '300–329', lo: 299.5, hi: 329.5 },
  { label: '330–359', lo: 329.5, hi: 359.5 },
  { label: '360 or more', lo: 359.5, hi: Infinity },
]

// National popular-vote margin (Democratic minus Republican share, points).
// Exact boundary values are a measure-zero detail for the seed; the market
// description defines them (they go to the bucket farther from zero).
export const MARGIN_BUCKETS: Bucket[] = [
  { label: 'R+6 or more', lo: -Infinity, hi: -6 },
  { label: 'R+3 to R+6', lo: -6, hi: -3 },
  { label: 'R+0 to R+3', lo: -3, hi: 0 },
  { label: 'D+0 to D+3', lo: 0, hi: 3 },
  { label: 'D+3 to D+6', lo: 3, hi: 6 },
  { label: 'D+6 to D+9', lo: 6, hi: 9 },
  { label: 'D+9 or more', lo: 9, hi: Infinity },
]

export function normalBucketProbs(
  mu: number,
  sigma: number,
  buckets: Bucket[]
): number[] {
  if (!Number.isFinite(mu) || !(sigma > 0))
    throw new Error('normalBucketProbs: bad mu/sigma')
  return buckets.map(
    (b) => normCdf((b.hi - mu) / sigma) - normCdf((b.lo - mu) / sigma)
  )
}

// EV_D ~ Normal(μ, σ) with μ placed so P(EV_D ≥ 270) = pDem.
export const evMean = (pDem: number, sigma: number) =>
  269.5 + sigma * normInv(pDem)

// margin ~ Normal(μ, σ) with μ placed so P(margin > 0) = pDem.
export const marginMean = (pDem: number, sigma: number) =>
  sigma * normInv(pDem)

export function evBucketSeeds(pDem: number, sigma = 60): number[] {
  return floorAndNormalize(
    normalBucketProbs(evMean(pDem, sigma), sigma, EV_BUCKETS)
  )
}

export function marginBucketSeeds(pDem: number, sigma = 4.5): number[] {
  return floorAndNormalize(
    normalBucketProbs(marginMean(pDem, sigma), sigma, MARGIN_BUCKETS)
  )
}
