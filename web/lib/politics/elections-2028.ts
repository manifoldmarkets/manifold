import { keyBy, mean, omit, sortBy, uniq, uniqBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { Contract, isMultiCpmm, MultiContract } from 'common/contract'
import { getContractFromSlug, getContracts } from 'common/supabase/contracts'
import { REPLAY_COMPARISONS } from 'web/components/election-2026/replay-comparisons'
import type { ReplaySnapshot } from 'web/components/election-2026/replay-model'
import {
  ChamberScore,
  chamberScores,
  chamberWinner,
} from 'web/components/election-2026/replay-scorecard'
import { getPartyProbs } from 'web/components/usa-map/state-election-map'
import { api } from 'web/lib/api/api'
import { isOpenPublicMarket } from 'web/lib/politics/election-curation'
import {
  buildConditionalMatrixRows,
  conditionalMatrixIds,
  ConditionalMatrixRow,
  matrixRowContracts,
  PRESIDENT_2028_MATRIX,
  slimMatrixRows,
} from 'web/lib/politics/conditional-matrix'
import {
  pickUnprecedentedPolitics,
  UNPRECEDENTED_POLITICS_SLUGS,
} from 'web/lib/politics/unprecedented-politics'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import snapshot from 'web/public/data/election-2026-replay.json'
import swingsFile from 'web/public/data/election-2026-swings.json'
import { isCandidateAnswer, lookupCandidate } from './candidates'
import type { Swing2026, Swings2026File } from './swings-2026'
import {
  AFTER_2028,
  BEFORE_2028,
  CHART_SERIES,
  EC_MODEL_RHO,
  LIST_SERIES,
  NATIONAL_2028,
  POLLING_PERPS_2028,
  PRESIDENTIAL_2028_TOPIC_SLUG,
  PRIMARY_MARKETS_2028,
  RACE_CHARTS,
  RaceChartKey,
  STATE_MARKETS_2028,
  UNIT_PRIORS_2028,
} from './elections-2028-config'
import { ELECTORAL_UNITS, simulateElectoralCollege } from './ec-model'
import {
  encodeHistory,
  EncodedHistory,
  probAt,
  thinHistory,
  TimePoint,
} from './race-history'

// Everything the 2028-and-beyond /election page renders, loaded once per ISR
// revalidation.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// Race cards in the 2026 swings strip (after the two control markets).
const SWING_CARDS = 8

export type RaceSeries = {
  answerId: string
  text: string
  prob: number
  // Change over the last 7 days, from the history (probChanges.month is
  // unreliable on these markets, so nothing reads probChanges).
  weekChange: number
  history: EncodedHistory
}

export type RaceChart = {
  key: RaceChartKey
  title: string
  tab: string
  colorBy: 'party' | 'dem' | 'gop'
  // The listed answers and Other only: the browser fetches the full market
  // on mount (useLiveContract), and the bet modal waits for it.
  contract: MultiContract
  answerCount: number
  series: RaceSeries[]
}

export type UnitOdds = {
  key: string
  pDem: number
  // Undefined when the unit has no market and reads its prior.
  contractId?: string
  slug?: string
  creatorUsername?: string
}

export type ElectoralModel = {
  pDem: number
  pRep: number
  pTie: number
  meanDemEv: number
  // P(Democrat wins >= k EVs is in bucket), as [bucketStart, p] in 10-EV bins.
  histogram: [number, number][]
  tippingPoints: { key: string; p: number }[]
  units: UnitOdds[]
  sims: number
  rho: number
}

// The 2026 scorecard, reduced to what the banner says. `beatRealMoney` only
// when both chambers have resolved and Manifold was closer to the result at
// every forecast checkpoint in each (the same test /election2026's headline
// uses), so the claim can't run ahead of the numbers.
export type AccuracyStory = {
  beatRealMoney: boolean
  chambers: {
    chamber: 'senate' | 'house'
    name: string
    points: number
    ahead: number
    compared: number
    milestones: number
    resolved: boolean
    winner: 'D' | 'R' | null
  }[]
}

export function accuracyStory(scores: ChamberScore[]): AccuracyStory {
  const chambers = scores.map((s) => ({
    chamber: s.chamber,
    name: s.chamber === 'senate' ? 'Senate' : 'House',
    points: s.averagePoints,
    ahead: s.ahead,
    compared: s.compared,
    milestones: s.milestones,
    resolved: s.winner !== null,
    winner: s.winner,
  }))
  const beatRealMoney =
    chambers.length === 2 &&
    chambers.every(
      (c) =>
        c.resolved &&
        c.points > 0 &&
        c.milestones > 0 &&
        c.compared === c.milestones &&
        c.ahead === c.compared
    )
  return { beatRealMoney, chambers }
}

export type Mover = {
  chart: RaceChartKey
  answerId: string
  text: string
  prob: number
  weekChange: number
}

export type Elections2028PageProps = {
  now: number
  partyContract: Contract | null
  popularVoteContract: Contract | null
  congressContract: Contract | null
  charts: RaceChart[]
  movers: Mover[]
  demVpContract: Contract | null
  gopVpContract: Contract | null
  ticketContract: Contract | null
  model: ElectoralModel | null
  accuracy: AccuracyStory
  swings: Swing2026[]
  primaryContracts: Contract[]
  before2028Us: Contract[]
  before2028World: Contract[]
  contracts2030: Contract[]
  contracts2032: Contract[]
  presidencyMatrixRows: ConditionalMatrixRow[]
  unprecedentedContracts: Contract[]
  pollingPerpContracts: Contract[]
  trendingContracts: Contract[]
}

type AdminDb = Awaited<ReturnType<typeof initSupabaseAdmin>>

const isMulti = (c: Contract | undefined | null): c is MultiContract =>
  !!c && c.outcomeType === 'MULTIPLE_CHOICE' && isMultiCpmm(c)

type PointRow = { createdTime: number; probAfter: number; probBefore: number }

// At most a few bet-points queries in flight per revalidation: each is a
// sampled scan of contract_bets, and ~50 at once is a burst the read workers
// don't need.
const MAX_POINT_QUERIES = 6
let inFlight = 0
const waiting: (() => void)[] = []
async function limited<T>(task: () => Promise<T>): Promise<T> {
  // A freed slot passes straight to the next waiter, so the count never
  // dips below the cap while anyone is queued.
  if (inFlight >= MAX_POINT_QUERIES)
    await new Promise<void>((resolve) => waiting.push(resolve))
  else inFlight++
  try {
    return await task()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else inFlight--
  }
}

const fetchPoints = async (
  contractId: string,
  answerId: string,
  afterTime: number,
  beforeTime: number,
  limit: number,
  // Include the zero-share redemptions that record how other answers' trades
  // move this answer (sum-to-one markets). Accurate, but a scan over years of
  // a big market takes ~50 s, so only the recent window asks for them (1-5 s).
  withRedemptions: boolean
): Promise<PointRow[]> => {
  if (beforeTime <= afterTime) return []
  return (await limited(() =>
    api('bet-points', {
      contractId,
      answerId,
      afterTime,
      beforeTime,
      limit,
      ...(withRedemptions
        ? { filterRedemptions: false, includeZeroShareRedemptions: true }
        : { filterRedemptions: true }),
    })
  )) as unknown as PointRow[]
}

const RECENT_WINDOW = 30 * DAY

// An answer's sampled history (the bet-points API returns an even random
// sample when there are more bets than `limit`). Two windows so each caches
// well: everything before the last 30 days changes once a day (its own trades
// only), the last 30 days once an hour (every price move, including the ones
// other answers' trades cause, so the 7-day change is exact). `long: false`
// fetches only the recent window, enough for the weekly move. The live price
// is the last point.
async function getAnswerHistory(
  contract: MultiContract,
  answerId: string,
  now: number,
  long: boolean
): Promise<TimePoint[]> {
  const hourFloor = Math.floor(now / HOUR) * HOUR
  const recentStart = Math.max(
    contract.createdTime,
    Math.floor(now / DAY) * DAY - RECENT_WINDOW
  )
  const [old, recent] = await Promise.all([
    long
      ? fetchPoints(
          contract.id,
          answerId,
          contract.createdTime,
          recentStart,
          1500,
          false
        )
      : Promise.resolve([] as PointRow[]),
    fetchPoints(contract.id, answerId, recentStart, hourFloor, 2000, true),
  ])
  const rows = [...old, ...recent]
  const points: TimePoint[] = rows.map((r) => [r.createdTime, r.probAfter])
  // The price just before the earliest sampled bet, so the line starts where
  // trading did rather than at that bet's result.
  const first = sortBy(rows, (r) => r.createdTime)[0]
  if (first && Number.isFinite(first.probBefore))
    points.push([first.createdTime - 1, first.probBefore])
  points.push([now, getAnswerProbability(contract, answerId)])
  return points
}

// Page props carry dozens of markets; the cards never read descriptions, and
// the browser refetches every market on mount (useLiveContract), so drop the
// heavy fields here.
function slim<C extends Contract | null | undefined>(contract: C): C {
  if (!contract) return contract
  return omit(contract, 'description', 'coverImageUrl') as unknown as C
}

// Independent answers are separate markets, so a card can show (and bet on)
// the leading ones without the rest. Sum-to-one markets keep every answer:
// their bet preview prices all of them together.
const TRIMMED_ANSWERS = 15
function slimCard(contract: Contract): Contract {
  const c = slim(contract)
  if (
    c.outcomeType === 'MULTIPLE_CHOICE' &&
    isMultiCpmm(c) &&
    !c.shouldAnswersSumToOne &&
    c.answers.length > TRIMMED_ANSWERS
  ) {
    return {
      ...c,
      answers: sortBy(c.answers, (a) => -getAnswerProbability(c, a.id)).slice(
        0,
        TRIMMED_ANSWERS
      ),
    } as Contract
  }
  return c
}

async function getRaceChart(
  config: (typeof RACE_CHARTS)[number],
  contract: Contract | undefined,
  now: number
): Promise<RaceChart | null> {
  if (!isMulti(contract)) return null
  const ranked = sortBy(
    contract.answers.filter((a) => isCandidateAnswer(a.text) && !a.resolution),
    (a) => -getAnswerProbability(contract, a.id)
  ).slice(0, LIST_SERIES)

  const series = await Promise.all(
    ranked.map(async (answer, i): Promise<RaceSeries> => {
      const prob = getAnswerProbability(contract, answer.id)
      // Every listed answer needs its history for the weekly move; only the
      // charted ones ship it to the browser.
      let history: TimePoint[] = []
      try {
        history = thinHistory(
          await getAnswerHistory(contract, answer.id, now, i < CHART_SERIES),
          now
        )
      } catch (e) {
        console.error('race history failed', contract.id, answer.id, e)
      }
      const weekAgo = probAt(history, now - WEEK)
      return {
        answerId: answer.id,
        text: answer.text.trim(),
        prob,
        weekChange:
          weekAgo === undefined || !Number.isFinite(weekAgo)
            ? 0
            : prob - weekAgo,
        history: encodeHistory(i < CHART_SERIES ? history : []),
      }
    })
  )

  const listed = new Set(series.map((s) => s.answerId))
  return {
    key: config.key,
    title: config.title,
    tab: config.tab,
    colorBy: config.colorBy,
    contract: {
      ...slim(contract),
      answers: contract.answers.filter((a) => listed.has(a.id) || a.isOther),
    },
    answerCount: contract.answers.length,
    series,
  }
}

// The Democrat's two-party chance in each electoral unit, from its market, or
// the unit's prior when it has none.
function getUnitOdds(byId: Record<string, Contract>): UnitOdds[] {
  return ELECTORAL_UNITS.map((unit) => {
    const id = STATE_MARKETS_2028[unit.key]
    const contract = id ? byId[id] : undefined
    const probs =
      contract && !contract.isResolved ? getPartyProbs(contract) : undefined
    const twoParty = probs ? probs.dem + probs.rep : 0
    if (probs && twoParty > 0 && Number.isFinite(probs.dem / twoParty)) {
      return {
        key: unit.key,
        pDem: probs.dem / twoParty,
        contractId: contract!.id,
        slug: contract!.slug,
        creatorUsername: contract!.creatorUsername,
      }
    }
    return { key: unit.key, pDem: UNIT_PRIORS_2028[unit.key] ?? NaN }
  })
}

function getElectoralModel(units: UnitOdds[]): ElectoralModel {
  const result = simulateElectoralCollege(
    Object.fromEntries(units.map((u) => [u.key, u.pDem])),
    { sims: 20000, rho: EC_MODEL_RHO, seed: 2028 }
  )
  const histogram: [number, number][] = []
  for (let start = 0; start <= 530; start += 10) {
    let p = 0
    for (let k = start; k < start + 10 && k < result.distribution.length; k++)
      p += result.distribution[k]
    histogram.push([start, p])
  }
  return {
    pDem: result.pDem,
    pRep: result.pRep,
    pTie: result.pTie,
    meanDemEv: result.meanDemEv,
    histogram,
    tippingPoints: result.tippingPoints.slice(0, 8),
    units,
    sims: result.sims,
    rho: result.rho,
  }
}

async function getTrending2028(exclude: Set<string>, now: number) {
  try {
    const [hot, popular] = await Promise.all([
      api('search-markets-full', {
        term: '',
        sort: 'daily-score',
        filter: 'open',
        topicSlug: PRESIDENTIAL_2028_TOPIC_SLUG,
        limit: 40,
      }),
      api('search-markets-full', {
        term: '',
        sort: 'most-popular',
        filter: 'open',
        topicSlug: PRESIDENTIAL_2028_TOPIC_SLUG,
        limit: 40,
      }),
    ])
    const perCreator: Record<string, number> = {}
    const picked: Contract[] = []
    const candidates = uniqBy(
      [
        ...hot.filter((c) => Number.isFinite(c.dailyScore) && c.dailyScore > 0),
        ...popular,
      ],
      (c) => c.id
    )
    for (const c of candidates) {
      if (picked.length >= 8) break
      if (exclude.has(c.id) || !isOpenPublicMarket(c, now)) continue
      if ((c.uniqueBettorCount ?? 0) < 10) continue
      const n = perCreator[c.creatorId] ?? 0
      if (n >= 2) continue
      perCreator[c.creatorId] = n + 1
      picked.push(c)
    }
    return picked
  } catch (e) {
    console.error('getTrending2028 failed', e)
    return []
  }
}

// Manifold against real-money markets on the 2026 control markets, over the
// milestones before polls closed: the same numbers /election2026 leads with.
async function getScores(db: AdminDb): Promise<ChamberScore[]> {
  try {
    const [senate, house] = await Promise.all([
      getContractFromSlug(db, MIDTERMS_2026.senateControl),
      getContractFromSlug(db, MIDTERMS_2026.houseControl),
    ])
    return chamberScores(
      snapshot as unknown as ReplaySnapshot,
      REPLAY_COMPARISONS,
      {
        senate: { id: senate?.id, winner: chamberWinner(senate) },
        house: { id: house?.id, winner: chamberWinner(house) },
      }
    )
  } catch (e) {
    console.error('getScores failed', e)
    return []
  }
}

const slimOrNull = (c: Contract | null) => (c ? slimCard(c) : null)

const openOnly = (contracts: (Contract | undefined)[], now: number) =>
  contracts.filter((c): c is Contract => !!c && isOpenPublicMarket(c, now))

export async function getElections2028PageProps(): Promise<Elections2028PageProps> {
  const now = Date.now()
  const db = await initSupabaseAdmin()

  const matrixIds = uniq(conditionalMatrixIds([PRESIDENT_2028_MATRIX]))
  const ids = uniq([
    ...Object.values(NATIONAL_2028),
    ...Object.values(STATE_MARKETS_2028),
    ...BEFORE_2028.us,
    ...BEFORE_2028.world,
    ...AFTER_2028[2030],
    ...AFTER_2028[2032],
    ...PRIMARY_MARKETS_2028,
    ...matrixIds,
  ])

  const [fetched, scores, unprecedentedFound, perps] = await Promise.all([
    // No catch: without these markets the page is empty, and a failed
    // revalidation keeps serving the last good one.
    getContracts(db, ids, 'id', true),
    getScores(db),
    Promise.all(
      UNPRECEDENTED_POLITICS_SLUGS.map((slug) =>
        getContractFromSlug(db, slug).catch(() => null)
      )
    ),
    Promise.all(
      POLLING_PERPS_2028.map((slug) =>
        getContractFromSlug(db, slug).catch(() => null)
      )
    ),
  ])
  const byId = keyBy(fetched, (c) => c.id)
  const get = (id: string) => byId[id] ?? null

  const charts = (
    await Promise.all(
      RACE_CHARTS.map((config) => getRaceChart(config, byId[config.id], now))
    )
  ).filter((c): c is RaceChart => !!c)

  // The week's biggest moves across the three races, one entry per person
  // (their biggest).
  const movers = uniqBy(
    sortBy(
      charts.flatMap((chart) =>
        chart.series
          .filter((s) => Math.abs(s.weekChange) >= 0.01)
          .map((s) => ({
            chart: chart.key,
            answerId: s.answerId,
            text: s.text,
            prob: s.prob,
            weekChange: s.weekChange,
          }))
      ),
      (m) => -Math.abs(m.weekChange)
    ),
    // One card per person, however each market spells them.
    (m) => lookupCandidate(m.text).key
  ).slice(0, 6)

  let model: ElectoralModel | null = null
  try {
    // Only when every unit has a market or a documented prior: a missing,
    // unlisted or resolved state market must not turn into a coin flip.
    const units = getUnitOdds(byId)
    const unpriced = units.filter((u) => !Number.isFinite(u.pDem))
    if (unpriced.length === 0) model = getElectoralModel(units)
    else
      console.error(
        'electoral model skipped; no odds for',
        unpriced.map((u) => u.key).join(', ')
      )
  } catch (e) {
    console.error('electoral model failed', e)
  }

  const presidencyMatrixRows = slimMatrixRows(
    buildConditionalMatrixRows(PRESIDENT_2028_MATRIX, fetched, now)
  )

  // The curated list was written for the midterms; questions about 2026 are
  // over (or about to be) and don't belong on the 2028 page.
  const unprecedentedContracts = pickUnprecedentedPolitics(
    unprecedentedFound.filter(
      (c): c is Contract => !!c && !/2026/.test(c.question)
    ),
    {
      now,
      excludeIds: matrixRowContracts(presidencyMatrixRows).map((c) => c.id),
    }
  )

  const shown = new Set<string>([
    ...ids,
    ...unprecedentedContracts.map((c) => c.id),
  ])
  const trendingContracts = await getTrending2028(shown, now)

  return {
    now,
    partyContract: slim(get(NATIONAL_2028.party)),
    popularVoteContract: slim(get(NATIONAL_2028.popularVote)),
    congressContract: slim(get(NATIONAL_2028.congress)),
    charts,
    movers,
    demVpContract: slim(get(NATIONAL_2028.demVp)),
    gopVpContract: slim(get(NATIONAL_2028.gopVp)),
    ticketContract: slimOrNull(get(NATIONAL_2028.ticket)),
    model,
    accuracy: accuracyStory(scores),
    swings: (swingsFile as Swings2026File).swings.slice(0, 2 + SWING_CARDS),
    primaryContracts: openOnly(
      PRIMARY_MARKETS_2028.map((id) => byId[id]),
      now
    ).map(slimCard),
    before2028Us: openOnly(
      BEFORE_2028.us.map((id) => byId[id]),
      now
    ).map(slimCard),
    before2028World: openOnly(
      BEFORE_2028.world.map((id) => byId[id]),
      now
    ).map(slimCard),
    contracts2030: openOnly(
      AFTER_2028[2030].map((id) => byId[id]),
      now
    ).map(slimCard),
    contracts2032: openOnly(
      AFTER_2028[2032].map((id) => byId[id]),
      now
    ).map(slimCard),
    presidencyMatrixRows,
    unprecedentedContracts: unprecedentedContracts.map(slimCard),
    pollingPerpContracts: perps
      .filter((c): c is Contract => !!c && !c.isResolved && !c.resolution)
      .map(slim),
    trendingContracts: trendingContracts.map(slimCard),
  }
}

// Exported for the OG card and tests: the Democrat's and Republican's chances
// from the party market, two-party normalized for display.
export function partySplit(contract: Contract | null) {
  const probs = getPartyProbs(contract)
  if (!probs) return undefined
  return { dem: probs.dem, rep: probs.rep, other: probs.other }
}

export const averageEdge = (scores: ChamberScore[]) =>
  scores.length ? Math.round(mean(scores.map((s) => s.averagePoints))) : 0
