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
import freezeFile from 'web/public/data/election-board-freeze.json'
import officialFile from 'web/public/data/election-markets-2028.json'
import {
  fetchFrozenProbs,
  FreezeSnapshots,
  freezeHistoryGone,
  freezeStep,
  FrozenProbs,
  historyServes,
  twoPartyAtFreeze,
  twoPartyShare,
  twoPartyWeekAgo,
} from './board-odds'
import { ElectionPhase, electionPhase, showsSection } from './election-phase'
import {
  GOVERNOR_2028_HOLDER,
  MarketRef,
  OfficialMarketsFile,
  pageLoads,
  pickSlot,
  president2024Winner,
  SENATE_2028_HOLDER,
  SENATE_2028_SPECIAL_HOLDER,
} from './official-markets'
import {
  orderPrimaryRows,
  pickLeader,
  PrimaryCell,
  PrimaryRow,
} from './primaries'
import {
  BoardMode,
  boardMode,
  BoardOffice,
  BoardRace,
  calledFrom,
} from './race-board'
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
  BOARD_FREEZE,
  CHART_SERIES,
  COMMUNITY_EQUIVALENTS,
  EC_MODEL_RHO,
  HOUSE_2026_DISTRICTS_SLUG,
  LATER_KEYS,
  LIST_SERIES,
  NATIONAL_2028,
  OFFICIAL_PRESIDENT_2028,
  OFFICIAL_SLOTS,
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
  phase: ElectionPhase
  partyContract: Contract | null
  popularVoteContract: Contract | null
  // The official 2028 balance-of-power market, or (until it exists) the
  // community control-of-Congress market.
  balanceOfPowerContract: Contract | null
  congressContract: Contract | null
  charts: RaceChart[]
  movers: Mover[]
  demVpContract: Contract | null
  gopVpContract: Contract | null
  ticketContract: Contract | null
  model: ElectoralModel | null
  accuracy: AccuracyStory
  swings: Swing2026[]
  // The 2028 race board (President by unit, Senate, governor, House), and
  // how it places races: live rating, frozen rating, or result.
  board2028: BoardRace[]
  board2028Mode: BoardMode
  // From 2029: the 2030 board and balance of power.
  board2030: BoardRace[]
  board2030Mode: BoardMode
  balanceOfPower2030: Contract | null
  primaries: PrimaryRow[]
  primaryContracts: Contract[]
  // Official 2028 markets with no slot of their own (tipping point, margins,
  // conventions, …): placed automatically as the scripts add them.
  more2028: Contract[]
  offYear: Contract[]
  before2028World: Contract[]
  later: Contract[]
  presidencyMatrixRows: ConditionalMatrixRow[]
  unprecedentedContracts: Contract[]
  pollingPerpContracts: Contract[]
  trendingContracts: Contract[]
}

// ---------------------------------------------------------------------------
// Official markets
// ---------------------------------------------------------------------------

const OFFICIAL = (officialFile as unknown as OfficialMarketsFile).markets
const officialId = (key: string): string | undefined => OFFICIAL[key]?.id
const officialEntries = (
  pred: (ref: MarketRef, key: string) => boolean
): [string, MarketRef][] =>
  Object.entries(OFFICIAL).filter(([k, r]) => pred(r, k))

const unitKeyOf = (ref: MarketRef) =>
  ref.district !== undefined ? `${ref.state}-${ref.district}` : ref.state ?? ''

// The 2028 presidential units' official markets, by unit key ('PA', 'ME-2').
const OFFICIAL_UNITS_2028: Record<string, string> = Object.fromEntries(
  officialEntries((r) => r.cycle === 2028 && r.kind === 'president-unit').map(
    ([, r]) => [unitKeyOf(r), r.id]
  )
)

const MANIFOLD_POLITICS = 'ManifoldPolitics'

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

// Each electoral unit's market: the official one once it has caught up on
// traders, else the community one.
function unitContract(
  unitKey: string,
  byId: Record<string, Contract>
): Contract | undefined {
  const official = OFFICIAL_UNITS_2028[unitKey]
  const community = STATE_MARKETS_2028[unitKey]
  return pickSlot(
    official ? byId[official] : undefined,
    community ? byId[community] : undefined
  )
}

// The Democrat's two-party chance in each electoral unit, from its market, or
// the unit's prior when it has none.
function getUnitOdds(byId: Record<string, Contract>, now: number): UnitOdds[] {
  return ELECTORAL_UNITS.map((unit) => {
    const contract = unitContract(unit.key, byId)
    const odds =
      contract && !contract.isResolved ? partyOdds(contract, now) : undefined
    if (odds) {
      return {
        key: unit.key,
        pDem: odds.p,
        contractId: contract!.id,
        slug: contract!.slug,
        creatorUsername: contract!.creatorUsername,
      }
    }
    return { key: unit.key, pDem: UNIT_PRIORS_2028[unit.key] ?? NaN }
  })
}

// ---------------------------------------------------------------------------
// Race boards
// ---------------------------------------------------------------------------

const round3 = (x: number) => Math.round(x * 1000) / 1000

const readParty = (c: Contract) => getPartyProbs(c)

// A party market's Democratic two-party chance, its weekly move (also
// two-party), and whether it's called. `allowPriceCall`: a party at 99%+
// counts as called (election night on); otherwise only a resolved market is.
function partyOdds(contract: Contract, now: number, allowPriceCall = false) {
  const probs = getPartyProbs(contract)
  if (!probs) return undefined
  const p = twoPartyShare(contract, readParty)
  if (p === undefined) return undefined
  const weekAgo = contract.isResolved
    ? undefined
    : twoPartyWeekAgo(contract, now, readParty)
  const resolved = contract.isResolved && contract.resolution !== 'CANCEL'
  return {
    p,
    w: weekAgo === undefined ? undefined : p - weekAgo,
    c:
      resolved || allowPriceCall
        ? calledFrom({ dem: probs.dem, rep: probs.rep, other: probs.other })
        : undefined,
  }
}

const FREEZE_SNAPSHOTS = freezeFile as unknown as FreezeSnapshots

// Frozen probabilities by freeze time. A market's never change once known,
// so they're kept for the server's lifetime and each revalidation asks only
// for the ones still missing.
const frozenCache = new Map<number, FrozenProbs>()

// Every board market's probabilities at the freeze: the committed snapshot,
// else market-probs-history while it still serves the freeze (≤ 6 bounded
// requests). Never throws: a market it can't price shows its live odds, and
// the reason is logged.
async function frozenProbsFor(
  at: number,
  ids: string[],
  now: number
): Promise<FrozenProbs> {
  const known: FrozenProbs = {
    ...FREEZE_SNAPSHOTS[String(at)],
    ...frozenCache.get(at),
  }
  const missing = ids.filter((id) => !known[id])
  if (missing.length === 0) return known
  const when = new Date(at).toISOString()
  const step = freezeStep(at)
  if (step === undefined || !historyServes(at, now, step)) {
    if (freezeHistoryGone(at, now))
      console.log(
        `board freeze ${when}: no frozen odds for ${missing.length} races ` +
          'and market-probs-history no longer serves them; the board groups ' +
          'by result (scripts/election-board-freeze.ts can restore the columns)'
      )
    return known
  }
  const fetched = await fetchFrozenProbs(missing, at, step, (batch, start, s) =>
    api('market-probs-history', { ids: batch, start, step: s })
  )
  frozenCache.set(at, { ...frozenCache.get(at), ...fetched })
  const unpriced = missing.filter((id) => !fetched[id])
  if (unpriced.length > 0)
    console.error(
      `board freeze ${when}: no frozen odds yet for ${unpriced.length} races; ` +
        'they show live odds until a later revalidation'
    )
  return { ...known, ...fetched }
}

type BoardSeat = {
  o: BoardOffice
  st: string
  d?: number
  sp?: boolean
  holder?: 'D' | 'R'
  ev?: number
  prior?: number
}

// One board row. `frozen`: the freeze time and every market's probabilities
// then, once the columns have frozen.
function boardRow(
  seat: BoardSeat,
  contract: Contract | undefined,
  now: number,
  frozen: { at: number; probs: FrozenProbs; missing: string[] } | undefined
): BoardRace | undefined {
  const odds = contract ? partyOdds(contract, now, !!frozen) : undefined
  if (!odds && seat.prior === undefined) return undefined
  const fAt =
    odds && contract && frozen
      ? twoPartyAtFreeze(
          contract,
          frozen.at,
          frozen.probs[contract.id],
          readParty
        )
      : undefined
  if (odds && contract && frozen && fAt === undefined)
    frozen.missing.push(contract.id)
  const f = fAt === undefined ? undefined : round3(fAt)
  const row: BoardRace = {
    o: seat.o,
    st: seat.st,
    p: round3(odds?.p ?? (seat.prior as number)),
  }
  if (seat.d !== undefined) row.d = seat.d
  if (seat.sp) row.sp = 1
  if (odds?.w !== undefined && Math.abs(odds.w) >= 0.0005)
    row.w = round3(odds.w)
  if (f !== undefined) row.f = f
  if (odds?.c) row.c = odds.c
  if (seat.holder) row.h = seat.holder
  if (contract) {
    row.s = contract.slug
    if (contract.creatorUsername !== MANIFOLD_POLITICS)
      row.u = contract.creatorUsername
  }
  if (seat.ev) row.ev = seat.ev
  return row
}

// 2026 House winners where known: the competitive-district market's
// resolved answers ("Arizona 1", "Alaska at-large", "Arizona 2 · …").
function house2026Winners(
  contract: Contract | null
): Record<string, 'D' | 'R'> {
  const out: Record<string, 'D' | 'R'> = {}
  if (!contract || !isMultiCpmm(contract)) return out
  const codeByName = Object.fromEntries(
    ELECTORAL_UNITS.filter((u) => u.key === u.state).map((u) => [u.name, u.key])
  )
  for (const a of contract.answers) {
    if (a.resolution !== 'YES' && a.resolution !== 'NO') continue
    const m = a.text
      .split('·')[0]
      .trim()
      .match(/^(.+?) (at-large|\d+)$/)
    const code = m ? codeByName[m[1]] : undefined
    if (!code) continue
    const d = m![2] === 'at-large' ? 0 : Number(m![2])
    out[`${code}-${d}`] = a.resolution === 'YES' ? 'D' : 'R'
  }
  return out
}

async function raceBoard(
  cycle: number,
  byId: Record<string, Contract>,
  now: number,
  house2026: Record<string, 'D' | 'R'>
): Promise<{ races: BoardRace[]; mode: BoardMode }> {
  const freezeTime = BOARD_FREEZE[cycle]
  const frozen = freezeTime !== undefined && now >= freezeTime
  const seats: [BoardSeat, Contract | undefined][] = []

  if (cycle === 2028) {
    for (const unit of ELECTORAL_UNITS) {
      const [st, d] = unit.key.split('-')
      seats.push([
        {
          o: 'P',
          st,
          d: d === undefined ? undefined : Number(d),
          holder: president2024Winner(unit.key),
          ev: unit.ev,
          prior: UNIT_PRIORS_2028[unit.key],
        },
        unitContract(unit.key, byId),
      ])
    }
  }
  for (const [, ref] of officialEntries(
    (r) =>
      r.cycle === cycle &&
      (r.kind === 'senate' || r.kind === 'governor' || r.kind === 'house')
  )) {
    const contract = byId[ref.id]
    if (!contract) continue // not created yet
    const st = ref.state ?? ''
    const o: BoardOffice =
      ref.kind === 'senate' ? 'S' : ref.kind === 'governor' ? 'G' : 'H'
    const holder =
      cycle !== 2028
        ? undefined
        : o === 'S'
        ? (ref.special ? SENATE_2028_SPECIAL_HOLDER : SENATE_2028_HOLDER)[st]
        : o === 'G'
        ? GOVERNOR_2028_HOLDER[st]
        : house2026[`${st}-${ref.district ?? 0}`]
    seats.push([{ o, st, d: ref.district, sp: ref.special, holder }, contract])
  }

  // One batch for the whole board once it has frozen.
  const frozenProbs = frozen
    ? await frozenProbsFor(
        freezeTime,
        uniq(seats.flatMap(([, c]) => (c ? [c.id] : []))),
        now
      )
    : undefined
  const unfrozen: string[] = []
  const races = seats
    .map(([seat, contract]) =>
      boardRow(
        seat,
        contract,
        now,
        frozenProbs && {
          at: freezeTime,
          probs: frozenProbs,
          missing: unfrozen,
        }
      )
    )
    .filter((r): r is BoardRace => !!r)
  const mode = boardMode({
    frozen,
    missingFrozenOdds: unfrozen.length,
    historyGone: frozen && freezeHistoryGone(freezeTime, now),
  })
  return { races, mode }
}

// ---------------------------------------------------------------------------
// Primaries
// ---------------------------------------------------------------------------

function leaderCell(contract: Contract | undefined): PrimaryCell | undefined {
  if (!contract || !isMulti(contract)) return undefined
  const won = contract.isResolved && contract.resolution !== 'CANCEL'
  const leader = pickLeader(
    contract.answers.map((a) => {
      const prob = getAnswerProbability(contract, a.id)
      return {
        text: a.text.trim(),
        prob,
        isOther: a.isOther,
        won: won && prob >= 0.999,
      }
    })
  )
  const cell: PrimaryCell = { s: contract.slug }
  if (contract.creatorUsername !== MANIFOLD_POLITICS)
    cell.u = contract.creatorUsername
  if (leader) {
    cell.l = leader.text
    cell.p = round3(leader.prob)
    if (leader.won) cell.won = 1
  }
  return cell
}

function primaryRows(byId: Record<string, Contract>): PrimaryRow[] {
  const rows = new Map<string, PrimaryRow>()
  for (const [key, ref] of officialEntries(
    (r) =>
      r.kind === 'presidential-primary' ||
      r.kind === 'senate-primary' ||
      r.kind === 'governor-primary'
  )) {
    const community = COMMUNITY_EQUIVALENTS[key]
    const contract = pickSlot(
      byId[ref.id],
      community ? byId[community] : undefined
    )
    const cell = leaderCell(contract)
    if (!cell || !ref.state) continue
    const o: PrimaryRow['o'] =
      ref.kind === 'presidential-primary'
        ? 'P'
        : ref.kind === 'senate-primary'
        ? 'S'
        : 'G'
    const k = `${o}-${ref.state}${ref.special ? '-sp' : ''}-${ref.cycle}`
    const row: PrimaryRow = rows.get(k) ?? { k, o, st: ref.state }
    if (ref.special) row.sp = 1
    if (ref.cycle !== 2028) row.y = ref.cycle
    if (ref.party === 'D') row.D = cell
    else if (ref.party === 'R') row.R = cell
    else row.A = cell
    rows.set(k, row)
  }
  return orderPrimaryRows([...rows.values()])
}

// An official market by key, or the community market it replaces.
function slotFor(key: string, byId: Record<string, Contract>) {
  const id = officialId(key)
  const community = COMMUNITY_EQUIVALENTS[key]
  return pickSlot(
    id ? byId[id] : undefined,
    community ? byId[community] : undefined
  )
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
  const phase = electionPhase(now)
  const db = await initSupabaseAdmin()

  const wants2030 = showsSection(phase, 'midterms2030')
  const wantsPrimaries = showsSection(phase, 'primaries')

  // Official markets the page may show, by id. Ones not created yet (or
  // still unlisted while being created) simply don't come back.
  const show = {
    primaries: wantsPrimaries,
    midterms2030: wants2030,
    year: new Date(now).getUTCFullYear(),
  }
  const officialIds = officialEntries((r) => pageLoads(r, show)).map(
    ([, r]) => r.id
  )

  const matrixIds = uniq(conditionalMatrixIds([PRESIDENT_2028_MATRIX]))
  const ids = uniq([
    ...Object.values(NATIONAL_2028),
    OFFICIAL_PRESIDENT_2028,
    ...Object.values(STATE_MARKETS_2028),
    ...BEFORE_2028.us,
    ...BEFORE_2028.world,
    ...AFTER_2028[2030],
    ...AFTER_2028[2032],
    ...Object.values(COMMUNITY_EQUIVALENTS),
    ...PRIMARY_MARKETS_2028,
    ...matrixIds,
    ...officialIds,
  ])

  const [fetched, scores, unprecedentedFound, perps, house2026Market] =
    await Promise.all([
      // No catch: without these markets the page is empty, and a failed
      // revalidation keeps serving the last good one. Public only, so a
      // market mid-creation (unlisted) isn't shown early.
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
      getContractFromSlug(db, HOUSE_2026_DISTRICTS_SLUG).catch(() => null),
    ])
  const byId = keyBy(fetched, (c) => c.id)
  const get = (id: string) => byId[id] ?? null

  // Each slot: the official market once it has as many traders as the
  // community one there.
  const slot = (key: keyof typeof OFFICIAL_SLOTS, community: string) =>
    pickSlot(byId[officialId(OFFICIAL_SLOTS[key]) ?? ''], byId[community]) ??
    null
  const partyContract = slot('party', NATIONAL_2028.party)
  const chartContracts: Record<RaceChartKey, Contract | undefined> = {
    president: pickSlot(
      byId[OFFICIAL_PRESIDENT_2028],
      byId[NATIONAL_2028.president]
    ),
    demNominee: slot('demNominee', NATIONAL_2028.demNominee) ?? undefined,
    gopNominee: slot('gopNominee', NATIONAL_2028.gopNominee) ?? undefined,
  }
  const officialBop = byId[officialId(OFFICIAL_SLOTS.balanceOfPower) ?? '']

  const charts = (
    await Promise.all(
      RACE_CHARTS.map((config) =>
        getRaceChart(config, chartContracts[config.key], now)
      )
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
    const units = getUnitOdds(byId, now)
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

  const house2026 = house2026Winners(house2026Market)
  const [board2028, board2030] = await Promise.all([
    raceBoard(2028, byId, now, house2026),
    wants2030
      ? raceBoard(2030, byId, now, {})
      : Promise.resolve({ races: [] as BoardRace[], mode: 'live' as const }),
  ])

  const presidencyMatrixRows = slimMatrixRows(
    buildConditionalMatrixRows(PRESIDENT_2028_MATRIX, fetched, now)
  )

  // The curated list was written for the midterms; questions about 2026 are
  // over (or about to be) and don't belong on the 2028 page.
  const unprecedentedContracts = pickUnprecedentedPolitics(
    unprecedentedFound.filter(
      (c): c is Contract => !!c && !/2026/.test(c.question)
    ),
    {
      now,
      excludeIds: matrixRowContracts(presidencyMatrixRows).map((c) => c.id),
    }
  )

  // Official national markets placed by cycle, as the scripts add them: the
  // off-year races (2027, 2029), 2028 markets with no slot of their own, and
  // the later cycles in LATER_KEYS order (then anything else).
  const slotted = new Set<string>([
    ...Object.values(OFFICIAL_SLOTS),
    ...LATER_KEYS,
  ])
  const national = officialEntries((r) => r.kind === 'national')
  const offYearOfficial = national
    .filter(([, r]) => r.cycle % 2 === 1)
    .map(([key]) => slotFor(key, byId))
  const offYear = uniqBy(
    [
      ...offYearOfficial,
      // Community-only off-year markets (Speaker, mayors, specials), until
      // they resolve.
      ...BEFORE_2028.us
        .filter((id) => !Object.values(COMMUNITY_EQUIVALENTS).includes(id))
        .map((id) => byId[id]),
    ].filter((c): c is Contract => !!c && isOpenPublicMarket(c, now)),
    (c) => c.id
  )
  const more2028 = national
    .filter(([key, r]) => r.cycle === 2028 && !slotted.has(key))
    .map(([, r]) => byId[r.id])
    .filter((c): c is Contract => !!c && isOpenPublicMarket(c, now))
  const laterKeys = [
    ...LATER_KEYS,
    ...national
      .filter(([key, r]) => r.cycle >= 2030 && !LATER_KEYS.includes(key))
      .map(([key]) => key),
  ].filter((key) => !(wants2030 && key === '2030-balance-of-power'))
  const later = uniqBy(
    [
      ...laterKeys.map((key) => slotFor(key, byId)),
      // Community-only later markets until the official ones exist.
      ...[...AFTER_2028[2030], ...AFTER_2028[2032]].map((id) => byId[id]),
    ].filter((c): c is Contract => !!c && isOpenPublicMarket(c, now)),
    (c) => c.id
  )

  const shown = new Set<string>([
    ...ids,
    ...unprecedentedContracts.map((c) => c.id),
  ])
  const trendingContracts = await getTrending2028(shown, now)

  return {
    now,
    phase,
    partyContract: slim(partyContract),
    popularVoteContract: slim(slot('popularVote', NATIONAL_2028.popularVote)),
    balanceOfPowerContract: officialBop ? slim(officialBop) : null,
    congressContract: officialBop ? null : slim(get(NATIONAL_2028.congress)),
    charts,
    movers,
    demVpContract: slim(slot('demVp', NATIONAL_2028.demVp)),
    gopVpContract: slim(slot('gopVp', NATIONAL_2028.gopVp)),
    ticketContract: slimOrNull(get(NATIONAL_2028.ticket)),
    model,
    accuracy: accuracyStory(scores),
    swings: (swingsFile as Swings2026File).swings.slice(0, 2 + SWING_CARDS),
    board2028: board2028.races,
    board2028Mode: board2028.mode,
    board2030: board2030.races,
    board2030Mode: board2030.mode,
    balanceOfPower2030: wants2030
      ? slim(slotFor('2030-balance-of-power', byId) ?? null)
      : null,
    primaries: wantsPrimaries ? primaryRows(byId) : [],
    primaryContracts: openOnly(
      PRIMARY_MARKETS_2028.filter(
        (id) => !Object.values(COMMUNITY_EQUIVALENTS).includes(id)
      ).map((id) => byId[id]),
      now
    ).map(slimCard),
    more2028: more2028.map(slimCard),
    offYear: offYear.map(slimCard),
    before2028World: openOnly(
      BEFORE_2028.world.map((id) => byId[id]),
      now
    ).map(slimCard),
    later: later.map(slimCard),
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
