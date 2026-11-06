// State-by-state primaries: who leads (or won) each party's contest. Pure.

import { sortBy } from 'lodash'

import { placeName, TERRITORIES } from './official-markets'

// One market's leader, short keys for the page props.
export type PrimaryCell = {
  s: string // slug
  u?: string // creator, when not @ManifoldPolitics
  l?: string // leading (or winning) candidate
  p?: number // their chance
  won?: 1 // resolved to them
}

export type PrimaryRow = {
  k: string
  o: 'P' | 'S' | 'G' // presidential, Senate, governor
  st: string
  sp?: 1
  y?: number // election year, when not 2028 (Minnesota's 2027 special)
  D?: PrimaryCell
  R?: PrimaryCell
  A?: PrimaryCell // one market for every party (top-two or top-four primaries)
}

export type LeaderAnswer = {
  text: string
  prob: number
  isOther?: boolean
  // 'YES' for the winner of a resolved market.
  won?: boolean
}

// The winner if the market has resolved; otherwise the named candidate with
// the best chance (Other is a bucket, not a candidate, even when it leads an
// open field).
export function pickLeader(
  answers: LeaderAnswer[]
): { text: string; prob: number; won: boolean } | undefined {
  const winner = answers.find((a) => a.won)
  if (winner) return { text: winner.text, prob: 1, won: true }
  const top = sortBy(
    answers.filter((a) => !a.isOther && Number.isFinite(a.prob)),
    (a) => -a.prob
  )[0]
  return top ? { text: top.text, prob: top.prob, won: false } : undefined
}

// The first four contests, in their traditional order.
export const EARLY_STATES = ['IA', 'NH', 'SC', 'NV']

// Early states first, then the states and DC alphabetically, then the
// territories and Democrats Abroad; an earlier year's contest first.
export function orderPrimaryRows(rows: PrimaryRow[]) {
  const rank = (st: string) => {
    const early = EARLY_STATES.indexOf(st)
    if (early >= 0) return early
    if (st in TERRITORIES) return 200
    return 100
  }
  return sortBy(
    rows,
    (r) => rank(r.st),
    (r) => placeName(r.st),
    (r) => r.o,
    (r) => r.y ?? 2028
  )
}

// "Senate", "Senate (special)", "Senate (2027 special)", "Governor".
export const primaryOffice = (row: Pick<PrimaryRow, 'o' | 'sp' | 'y'>) => {
  const office = row.o === 'S' ? 'Senate' : 'Governor'
  if (!row.sp && !row.y) return office
  return `${office} (${[row.y, row.sp ? 'special' : undefined]
    .filter(Boolean)
    .join(' ')})`
}
