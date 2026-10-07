import { keyBy, omit } from 'lodash'

import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'

import { isOpenPublicMarket } from './election-curation'

// Conditional-market matrices for /election, in the spirit of the 2024 "if
// Harris / if Trump" table: each row is one question asked twice, once under
// each outcome of a race, and the two columns put the chances side by side.
//
// Rows are configured by contract id. The ids are reserved before the markets
// are created, so a row whose two markets are not both found, open, public and
// binary is dropped, and a matrix with fewer than MATRIX_MIN_ROWS complete rows
// is hidden. The page therefore ships safely before any of these markets exist.

/** One row of config: a short curated label and the two markets' ids. */
export type ConditionalMatrixPair = {
  label: string
  // The market asked under the Democratic outcome.
  dem: string
  // The same question under the Republican outcome.
  rep: string
}

/** A complete row, ready to render. */
export type ConditionalMatrixRow = {
  label: string
  dem: BinaryContract
  rep: BinaryContract
}

export type MatrixParty = 'dem' | 'rep'

/** A column: the condition it is asked under, in that party's color. */
export type ConditionalMatrixColumn = {
  party: MatrixParty
  // The header, e.g. "If Democrats win the House".
  label: string
  // A short tag under each chance on phones, where the header has scrolled
  // out of view, e.g. "Dem House".
  shortLabel: string
  // The condition's current chance, shown in the header when known.
  prob?: number
}

export type MatrixColumns = [ConditionalMatrixColumn, ConditionalMatrixColumn]

export const HOUSE_2026_COLUMNS: MatrixColumns = [
  { party: 'dem', label: 'If Democrats win the House', shortLabel: 'Dem House' },
  {
    party: 'rep',
    label: 'If Republicans keep the House',
    shortLabel: 'Rep House',
  },
]

export const SENATE_2026_COLUMNS: MatrixColumns = [
  {
    party: 'dem',
    label: 'If Democrats win the Senate',
    shortLabel: 'Dem Senate',
  },
  {
    party: 'rep',
    label: 'If Republicans keep the Senate',
    shortLabel: 'Rep Senate',
  },
]

export const PRESIDENT_2028_COLUMNS: MatrixColumns = [
  { party: 'dem', label: 'If the Democrat wins', shortLabel: 'Dem wins' },
  { party: 'rep', label: 'If the Republican wins', shortLabel: 'Rep wins' },
]

/** The columns with each condition's current chance, where it is known. */
export function withConditionProbs(
  columns: MatrixColumns,
  odds: { dem: number; rep: number } | undefined
): MatrixColumns {
  const prob = (party: MatrixParty) => {
    const p = odds?.[party]
    return p != null && Number.isFinite(p) ? p : undefined
  }
  return [
    { ...columns[0], prob: prob(columns[0].party) },
    { ...columns[1], prob: prob(columns[1].party) },
  ]
}

export const MATRIX_MIN_ROWS = 2
// A matrix longer than this shows its first MATRIX_COLLAPSED_ROWS rows and a
// "Show all" toggle.
export const MATRIX_COLLAPSE_ABOVE = 8
export const MATRIX_COLLAPSED_ROWS = 6

// 2026 House: "If Democrats win the House in 2026, …" (dem) and "If
// Republicans keep the House in 2026, …" (rep).
export const HOUSE_2026_MATRIX: ConditionalMatrixPair[] = [
  {
    label: 'House impeaches Trump (by Jan 2029)',
    dem: 'QSAIq5EEps',
    rep: 'POZNNqR528',
  },
  {
    label: 'House impeaches a Cabinet member',
    dem: 'Cc2dz0dy8u',
    rep: 'dQ9cPpdLAR',
  },
  {
    label: 'Trump vetoes 5+ bills in 2027',
    dem: 'IdIlhAuL02',
    rep: 'LzQcAQsZzE',
  },
  {
    label: 'Government shutdown in 2027',
    dem: '2RZ2c5ZICl',
    rep: '8RI2Qy9ndh',
  },
  {
    label: "Law cuts Trump's tariffs (by Jan 2029)",
    dem: 'L2tP2lRy96',
    rep: 'ydZgyC922t',
  },
  {
    label: "Congress bans members' stock trading",
    dem: 'PISSh8sRE2',
    rep: 'ChhNhQqs9s',
  },
  {
    label: 'Trump approval ≥ 40% on Jan 1, 2028',
    dem: 'c0OOcRRnP5',
    rep: '9EZZl66SL8',
  },
  {
    label: 'GDP shrinks in a quarter of 2027',
    dem: 'ydPUQSsR0P',
    rep: 'y9Zl62R9tE',
  },
  {
    label: 'S&P 500 up in 2027 (vs Election Day)',
    dem: 'C9pqA8yg00',
    rep: 'usOOuPqSst',
  },
  {
    label: 'Bitcoin above $150k at end of 2027',
    dem: 'LtsLyPhUs2',
    rep: 'RS5Q5QQ8uS',
  },
]

// 2026 Senate: "If Democrats win the Senate in 2026, …" (dem: 51+ seats with
// caucusing independents) and "If Republicans keep the Senate in 2026, …"
// (rep: 50+, as the Vice President breaks ties).
export const SENATE_2026_MATRIX: ConditionalMatrixPair[] = [
  {
    label: 'A justice leaves the Supreme Court (by Jan 2029)',
    dem: 'lE0ypZZzgU',
    rep: 'csSL8qpuLR',
  },
  {
    label: 'Senate confirms a new Supreme Court justice',
    dem: 'pcdS8RNNRA',
    rep: 'RU8Rztcs28',
  },
  {
    label: '40+ federal judges confirmed in 2027–28',
    dem: 'EpsCdguPRg',
    rep: 'A09yzLq6Ig',
  },
  {
    label: 'A Cabinet nomination is rejected or withdrawn',
    dem: 'ptntLEl2sz',
    rep: 'uZzcdhuhQE',
  },
  {
    label: 'Government shutdown in 2027',
    dem: 'dsZz9nNCsR',
    rep: 'qdu8QIEgyp',
  },
  {
    label: 'Legislative filibuster ended (by Jan 2029)',
    dem: 'hyyQAQLtId',
    rep: 'PRzQ859g60',
  },
]

// 2028 presidency: "If the Democratic nominee wins the 2028 presidential
// election, …" (dem) and "If the Republican nominee wins …" (rep).
export const PRESIDENT_2028_MATRIX: ConditionalMatrixPair[] = [
  {
    label: 'S&P 500 up by end of 2029 (vs Election Day)',
    dem: 'OAhNt0zI2Q',
    rep: 'pO5Ap9Zsp2',
  },
  {
    label: 'GDP shrinks in a quarter, 2029–30',
    dem: 'gR9NSt5N98',
    rep: 'cdlURNhhqR',
  },
  {
    label: 'Supreme Court grows beyond nine (by 2033)',
    dem: 'cR0sltZnhC',
    rep: 'uC9C9PC9n2',
  },
  {
    label: 'Marijuana federally descheduled (by 2033)',
    dem: 'CuChuRRyt2',
    rep: 'E5dENyyc8P',
  },
  {
    label: 'Legislative filibuster ended (by 2031)',
    dem: '8NcSUnlNUZ',
    rep: 's9O6zh8q5P',
  },
  {
    label: 'Federal abortion-rights law (by 2033)',
    dem: 'ycRlQ0g0qE',
    rep: 'p0z5t2cp0g',
  },
  {
    label: 'Bitcoin above $250k at end of 2030',
    dem: 'l0g5lAQLg2',
    rep: '5cclR289cE',
  },
]

export type CongressChamber = 'senate' | 'house'

/**
 * The 2026 Congress matrices that have rows to show, Senate first: it is the
 * chamber most likely to flip. The page offers a switch when both do.
 */
export function congressChambers(
  rows: Record<CongressChamber, ConditionalMatrixRow[]>
): CongressChamber[] {
  return (['senate', 'house'] as const).filter((c) => rows[c].length > 0)
}

/** Every contract id the matrices reference, for one batched fetch. */
export function conditionalMatrixIds(
  matrices: ConditionalMatrixPair[][] = [
    SENATE_2026_MATRIX,
    HOUSE_2026_MATRIX,
    PRESIDENT_2028_MATRIX,
  ]
): string[] {
  return matrices.flat().flatMap((p) => [p.dem, p.rep])
}

const isBinaryCpmm = (c: Contract): c is BinaryContract =>
  c.mechanism === 'cpmm-1' && c.outcomeType === 'BINARY'

/**
 * Resolve a matrix's config against the fetched contracts. Keeps config order,
 * drops a row unless both of its markets were found and are open, public and
 * binary, and returns [] (the matrix is hidden) when fewer than
 * MATRIX_MIN_ROWS rows survive.
 */
export function buildConditionalMatrixRows(
  pairs: ConditionalMatrixPair[],
  fetched: Contract[],
  now: number
): ConditionalMatrixRow[] {
  const byId = keyBy(fetched, (c) => c.id)
  const usable = (id: string) => {
    const c = byId[id]
    return c && isOpenPublicMarket(c, now) && isBinaryCpmm(c) ? c : undefined
  }
  const rows = pairs.flatMap((pair) => {
    const dem = usable(pair.dem)
    const rep = usable(pair.rep)
    return dem && rep ? [{ label: pair.label, dem, rep }] : []
  })
  return rows.length >= MATRIX_MIN_ROWS ? rows : []
}

/**
 * Page props carry every matrix market, so drop the heavy fields the matrix
 * never reads. The live contract fetched in the browser replaces these.
 */
export function slimMatrixRows(
  rows: ConditionalMatrixRow[]
): ConditionalMatrixRow[] {
  const slim = (c: BinaryContract) =>
    omit(c, 'description', 'coverImageUrl') as BinaryContract
  return rows.map((r) => ({ ...r, dem: slim(r.dem), rep: slim(r.rep) }))
}

export const matrixRowContracts = (rows: ConditionalMatrixRow[]) =>
  rows.flatMap((r) => [r.dem, r.rep])

/** The rows to show: all of them, or the first few of a long matrix. */
export function visibleMatrixRows<T>(rows: T[], showAll: boolean): T[] {
  return showAll || rows.length <= MATRIX_COLLAPSE_ABOVE
    ? rows
    : rows.slice(0, MATRIX_COLLAPSED_ROWS)
}

export const isMatrixCollapsible = (rowCount: number) =>
  rowCount > MATRIX_COLLAPSE_ABOVE

/** A market's chance, or undefined if it can't be read. */
export function matrixProb(contract: BinaryContract): number | undefined {
  const p = getDisplayProbability(contract)
  return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : undefined
}

/**
 * A chance as a whole-number percent label. The tails say "<1%" and ">99%"
 * rather than rounding a live market to a certain-looking 0% or 100%.
 */
export function wholePercent(prob: number | undefined): string {
  if (prob == null || !Number.isFinite(prob)) return '–'
  const p = Math.min(1, Math.max(0, prob))
  const n = Math.round(p * 100)
  if (n === 0 && p > 0) return '<1%'
  if (n === 100 && p < 1) return '>99%'
  return `${n}%`
}

/** The gap between two chances in whole percentage points, as displayed. */
export function gapPoints(a: number, b: number): number {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100))
}
