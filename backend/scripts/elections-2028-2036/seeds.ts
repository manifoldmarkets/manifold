// Stage A seeds: provisional priors from the last two presidential results,
// regressed toward even by office and horizon. Pure functions; SEEDS.md
// documents the formula and every parameter below.
import { normalizeSeeds } from '../elections-2026/market-seeds'
import { Cycle } from './cycles'

export type TwoParty = { d: number; r: number; total?: number }
export type UnitResults = Partial<Record<2020 | 2024, TwoParty>>

export type SeedOffice = 'president' | 'senate' | 'governor' | 'house'

export const SEED_PARAMS = {
  // Presidential results used, with equal weight. A unit missing a year
  // (districts redrawn since 2020) uses the years it has.
  years: [2020, 2024] as const,
  weights: { 2020: 1, 2024: 1 } as Record<2020 | 2024, number>,
  // Leans are measured against the national two-party margin of the same
  // year, so the prior assumes an even national environment (the national
  // market opens at 49.5 / 49.5 / 1).
  relativeToNational: true,
  // Standard deviation (points of two-party margin) of the uncertainty
  // around the lean for a 2028 race. Larger = closer to 50/50. Offices that
  // track presidential partisanship less (governors) get more regression.
  sigma2028: {
    president: 9,
    house: 10,
    senate: 14,
    governor: 20,
  } as Record<SeedOffice, number>,
  // Horizon: 2032 and 2036 regress further toward even.
  horizonMultiplier: { 2028: 1, 2032: 4 / 3, 2036: 5 / 3 } as Record<
    Cycle,
    number
  >,
  // "Another party or independent" share in percentage points.
  otherDefault: 1,
  // Seats where an independent or third-party win is a live possibility.
  // Keyed `${cycle}-${office}-${state}`; each exception is justified here
  // and repeated in SEEDS.md.
  otherExceptions: {
    '2028-senate-AK': {
      other: 8,
      why: 'Alaska: Lisa Murkowski won the 2010 general as a write-in and has openly weighed running as an independent; the top-four/ranked-choice system (if it survives the 2026 repeal vote) makes a non-party-line winner plausible.',
    },
    '2028-senate-UT': {
      other: 6,
      why: 'Utah: in 2022 Democrats endorsed independent Evan McMullin instead of fielding a nominee and he took 42.8% against Mike Lee; the same seat is up in 2028.',
    },
    '2032-senate-AK': {
      other: 5,
      why: 'Alaska: same system and independent tradition as 2028, with less specific evidence for the Class 2 seat.',
    },
    '2032-senate-ME': {
      other: 6,
      why: 'Maine: a strong independent tradition (Angus King, governors Longley and King) and ranked-choice tabulation; the Class 2 seat is Susan Collins’s.',
    },
    '2032-senate-NE': {
      other: 10,
      why: 'Nebraska: independent Dan Osborn took 46.5% against Deb Fischer in 2024 with no Democratic nominee and is the 2026 challenger to Pete Ricketts for this Class 2 seat; a repeat independent candidacy is likely.',
    },
    '2036-senate-ME': {
      other: 10,
      why: 'Maine: the Class 1 seat is Angus King’s (independent, caucuses with Democrats); his successor race may again feature a serious independent.',
    },
    '2036-senate-NE': {
      other: 5,
      why: 'Nebraska: Osborn-style independent candidacies ran in 2024 and 2026; the Class 1 seat is Deb Fischer’s.',
    },
    '2036-senate-VT': {
      other: 10,
      why: 'Vermont: the Class 1 seat is Bernie Sanders’s (independent since 2007); a successor running as an independent is plausible.',
    },
  } as Record<string, { other: number; why: string }>,
  // Hard limits from the create-market API (1–99 per answer), and the
  // three-answer normalisation that leaves the most lopsided seed at 98/1/1.
  minAnswer: 1,
  maxAnswer: 99,
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26; |error| < 1.5e-7).
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) throw new Error('normalCdf: non-finite input')
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const tail = (Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI)) * poly
  return z >= 0 ? 1 - tail : tail
}

// Two-party Democratic margin in points: 100 × (D − R) / (D + R).
export function twoPartyMargin(r: TwoParty): number {
  const { d, r: rep } = r
  if (![d, rep].every((x) => Number.isFinite(x) && x >= 0) || d + rep <= 0)
    throw new Error('twoPartyMargin: invalid vote counts')
  return (100 * (d - rep)) / (d + rep)
}

// Weighted mean, over the years the unit has, of the unit's margin relative
// to the national margin of the same year.
export function leanOf(unit: UnitResults, national: UnitResults): number {
  let sum = 0
  let weight = 0
  for (const year of SEED_PARAMS.years) {
    const u = unit[year]
    const n = national[year]
    if (!u) continue
    if (!n) throw new Error(`leanOf: no national result for ${year}`)
    const margin =
      twoPartyMargin(u) -
      (SEED_PARAMS.relativeToNational ? twoPartyMargin(n) : 0)
    sum += SEED_PARAMS.weights[year] * margin
    weight += SEED_PARAMS.weights[year]
  }
  if (weight === 0) throw new Error('leanOf: unit has no results')
  return sum / weight
}

export function sigmaFor(office: SeedOffice, cycle: Cycle): number {
  const sigma =
    SEED_PARAMS.sigma2028[office] * SEED_PARAMS.horizonMultiplier[cycle]
  if (!Number.isFinite(sigma) || sigma <= 0)
    throw new Error(`sigmaFor: bad sigma for ${office} ${cycle}`)
  return sigma
}

// P(Democratic candidate wins the unit) from its lean.
export function democraticWinProbability(
  lean: number,
  office: SeedOffice,
  cycle: Cycle
): number {
  return normalCdf(lean / sigmaFor(office, cycle))
}

export function otherShareFor(
  cycle: Cycle,
  office: SeedOffice,
  state: string
): { other: number; why?: string } {
  const exception = SEED_PARAMS.otherExceptions[`${cycle}-${office}-${state}`]
  return exception ?? { other: SEED_PARAMS.otherDefault }
}

export type SeedResult = {
  // [Democratic, Republican, Another party or independent], one decimal,
  // sums to 100, each within the API's 1–99.
  probs: [number, number, number]
  lean: number
  sigma: number
  pDem: number
  other: number
  otherWhy?: string
  yearsUsed: (2020 | 2024)[]
}

export function stageASeed(opts: {
  cycle: Cycle
  office: SeedOffice
  state: string
  unit: UnitResults
  national: UnitResults
  // The national market itself has no lean: it is the even environment.
  nationalMarket?: boolean
  // Stage B: blend a certified 2026 result (a lean in the same units) into
  // the presidential lean with the given weight (0–1).
  blend?: { lean: number; weight: number }
}): SeedResult {
  const { cycle, office, state, unit, national } = opts
  const presidentialLean = opts.nationalMarket ? 0 : leanOf(unit, national)
  let lean = presidentialLean
  if (opts.blend) {
    const { weight } = opts.blend
    if (!(weight >= 0 && weight <= 1) || !Number.isFinite(opts.blend.lean))
      throw new Error('stageASeed: invalid blend')
    lean = (1 - weight) * presidentialLean + weight * opts.blend.lean
  }
  const sigma = sigmaFor(office, cycle)
  const pDem = normalCdf(lean / sigma)
  const { other, why } = otherShareFor(cycle, office, state)
  const weights = [pDem * (100 - other), (1 - pDem) * (100 - other), other]
  const probs = normalizeSeeds(weights) as [number, number, number]
  assertSeedConstraints(probs)
  return {
    probs,
    lean,
    sigma,
    pDem,
    other,
    otherWhy: why,
    yearsUsed: SEED_PARAMS.years.filter((y) => unit[y]) as (2020 | 2024)[],
  }
}

export function assertSeedConstraints(probs: number[]) {
  if (probs.length !== 3) throw new Error('three answers expected')
  for (const p of probs) {
    if (!Number.isFinite(p)) throw new Error('seed is not finite')
    if (p < SEED_PARAMS.minAnswer || p > SEED_PARAMS.maxAnswer)
      throw new Error(
        `seed ${p} outside ${SEED_PARAMS.minAnswer}-${SEED_PARAMS.maxAnswer}`
      )
    if (Math.round(p * 10) !== p * 10)
      throw new Error(`seed ${p} has more than one decimal`)
  }
  const sum = probs.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 1e-9) throw new Error(`seeds sum to ${sum}`)
}

export function describeSeed(seed: SeedResult, cycle: Cycle): string {
  const years = seed.yearsUsed.join(' and ')
  const basis = seed.yearsUsed.length
    ? `two-party presidential margin in ${years} relative to the national margin (lean ${seed.lean.toFixed(
        1
      )} pts)`
    : 'no lean: the national market opens at the even environment the state seeds are measured against'
  return `SEED, not a forecast (Stage A prior): ${basis}, regressed toward even with σ = ${seed.sigma.toFixed(
    1
  )} pts for ${cycle} (P(Dem) = ${(seed.pDem * 100).toFixed(
    1
  )}%); "Another party or independent" = ${seed.other}%${
    seed.otherWhy ? ` (${seed.otherWhy})` : ''
  }; 1% floor, one decimal, remainder to the largest answer. See SEEDS.md.`
}
