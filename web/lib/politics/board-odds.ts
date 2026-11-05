// The race board's odds at other times: when the columns froze on election
// night, and a week ago (for the weekly move). Pure apart from the fetcher
// passed in, so it's tested with fixtures.
//
// The freeze reads market-probs-history: one request per 100 markets, its
// first frame set to the freeze time. That endpoint only serves the last 72
// hours. After that a server that hasn't cached the frozen odds groups the
// board by result instead (race-board.ts, BoardMode), unless a snapshot was
// committed to public/data/election-board-freeze.json
// (scripts/election-board-freeze.ts, optional).

import { chunk, mapValues, pickBy, uniq } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import {
  contractAsOf,
  MarketProbs,
  MarketProbsHistory,
  marketProbsAtFrame,
  PROBS_HISTORY_MAX_FRAMES,
  PROBS_HISTORY_MAX_WINDOW_MS,
  PROBS_HISTORY_MIN_STEP_MS,
} from 'common/market-probs-history'
import { DAY_MS, MINUTE_MS } from 'common/util/time'

import type { MarketRef } from './official-markets'

// Each market's probabilities at the freeze, by contract id.
export type FrozenProbs = { [contractId: string]: MarketProbs }
// Committed snapshots, by freeze time (ms, as a string).
export type FreezeSnapshots = { [freezeAt: string]: FrozenProbs }

export type HistoryFetcher = (
  ids: string[],
  start: number,
  step: number
) => Promise<MarketProbsHistory>

// The endpoint's limit per request.
export const FREEZE_BATCH = 100

// The largest step the endpoint takes that divides the freeze time: the
// first frame is then the freeze itself, and the request spans the fewest
// frames.
export function freezeStep(at: number): number | undefined {
  for (
    let step = DAY_MS;
    step >= PROBS_HISTORY_MIN_STEP_MS;
    step -= PROBS_HISTORY_MIN_STEP_MS
  )
    if (at % step === 0) return step
  return undefined
}

// Room for clock drift between this server and the API, and the request's
// trip: the API refuses a start in the future or more than 72 hours back.
const LEAD_MS = MINUTE_MS
const TAIL_MS = 10 * MINUTE_MS

// Whether market-probs-history still serves the freeze as its first frame.
export function historyServes(at: number, now: number, step: number) {
  const age = now - at
  return (
    age >= LEAD_MS &&
    age <= PROBS_HISTORY_MAX_WINDOW_MS - TAIL_MS &&
    Math.floor(age / step) + 1 <= PROBS_HISTORY_MAX_FRAMES
  )
}

// Whether market-probs-history will never serve the freeze again: past its
// window, or a freeze time no step divides.
export function freezeHistoryGone(at: number, now: number) {
  const step = freezeStep(at)
  return (
    step === undefined || (now - at > LEAD_MS && !historyServes(at, now, step))
  )
}

const isProb = (x: number | undefined): x is number =>
  x !== undefined && Number.isFinite(x) && x >= 0 && x <= 1

const hasProbs = (probs: MarketProbs | undefined) =>
  !!probs &&
  (isProb(probs.prob) || Object.values(probs.answerProbs ?? {}).some(isProb))

// Each market's probabilities at the history's first frame, which must be
// the freeze. A market with none there (created later) is left out.
export function probsAtFreeze(
  history: MarketProbsHistory,
  at: number
): FrozenProbs {
  if (history?.times?.[0] !== at) return {}
  const probs = mapValues(history.markets ?? {}, (series) => {
    const p = marketProbsAtFrame(series, 0)
    const answerProbs = p.answerProbs && pickBy(p.answerProbs, isProb)
    return {
      ...(isProb(p.prob) && { prob: p.prob }),
      ...(answerProbs && { answerProbs }),
    } as MarketProbs
  })
  return pickBy(probs, hasProbs)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms} ms`)),
        ms
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

// The frozen probabilities of `ids`: at most one request per 100 markets,
// `concurrency` at a time, each abandoned after `timeoutMs`, so the work is
// bounded however the API is doing. A failed request is logged and its
// markets left out (the caller shows their live odds).
export async function fetchFrozenProbs(
  ids: string[],
  at: number,
  step: number,
  fetcher: HistoryFetcher,
  opts: {
    concurrency?: number
    timeoutMs?: number
    log?: (message: string, error?: unknown) => void
  } = {}
): Promise<FrozenProbs> {
  // Six batches, three at a time, 5 s each: at most ~10 s.
  const { concurrency = 3, timeoutMs = 5_000, log = console.error } = opts
  // Sorted, so every revalidation sends the same batches and hits the
  // API's cache.
  const batches = chunk(uniq(ids).sort(), FREEZE_BATCH)
  const out: FrozenProbs = {}
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      try {
        const history = await withTimeout(fetcher(batch, at, step), timeoutMs)
        const probs = probsAtFreeze(history, at)
        for (const id of batch) if (probs[id]) out[id] = probs[id]
      } catch (e) {
        log(
          `board freeze: market-probs-history failed for ${batch.length} markets`,
          e
        )
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, worker)
  )
  return out
}

type PartyProbs = (
  contract: Contract
) => { dem: number; rep: number } | undefined

// The Democrat's two-party share of a party market, read as the live odds
// are (getPartyProbs on the page).
export function twoPartyShare(
  contract: Contract,
  partyProbs: PartyProbs
): number | undefined {
  const probs = partyProbs(contract)
  if (!probs) return undefined
  const total = probs.dem + probs.rep
  const share = probs.dem / total
  return total > 0 && Number.isFinite(share) ? share : undefined
}

// The share at the freeze: the market re-priced to its frozen probabilities,
// without answers or resolutions that came later. Binary and multiple choice
// alike. Display only: the re-priced market is never traded against.
export function twoPartyAtFreeze(
  contract: Contract,
  at: number,
  probs: MarketProbs | undefined,
  partyProbs: PartyProbs
): number | undefined {
  if (!hasProbs(probs)) return undefined
  const asOf = contractAsOf(contract, at, probs)
  return asOf ? twoPartyShare(asOf, partyProbs) : undefined
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// The share a week ago, from each answer's (or a binary market's) 7-day
// change, so the weekly move is in two-party terms like the odds beside it.
// Undefined when no change is recorded.
export function twoPartyWeekAgo(
  contract: Contract,
  now: number,
  partyProbs: PartyProbs
): number | undefined {
  let probs: MarketProbs
  if (isMultiCpmm(contract)) {
    const answers = contract.answers.filter((a) =>
      Number.isFinite(a.probChanges?.week)
    )
    if (answers.length === 0) return undefined
    probs = {
      answerProbs: Object.fromEntries(
        answers.map((a) => [
          a.id,
          clamp01(getAnswerProbability(contract, a.id) - a.probChanges.week),
        ])
      ),
    }
  } else if (contract.mechanism === 'cpmm-1') {
    const week = contract.probChanges?.week
    if (!Number.isFinite(week)) return undefined
    probs = { prob: clamp01(contract.prob - week) }
  } else return undefined
  const asOf = contractAsOf(contract, now, probs)
  return asOf ? twoPartyShare(asOf, partyProbs) : undefined
}

// Every market that could fill a board row for `cycle`: its official race
// markets, plus (2028) the community market of each presidential unit.
export function boardMarketIds(
  cycle: number,
  markets: Record<string, MarketRef>,
  communityUnits: Record<string, string>
): string[] {
  const kinds = ['senate', 'governor', 'house', 'president-unit']
  return uniq([
    ...Object.values(markets)
      .filter((r) => r.cycle === cycle && kinds.includes(r.kind))
      .map((r) => r.id),
    ...(cycle === 2028 ? Object.values(communityUnits) : []),
  ]).sort()
}
