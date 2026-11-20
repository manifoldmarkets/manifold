import { LimitBet } from 'common/bet'
import { calculateProfitMetricsAtProbOrCancel } from 'common/calculate-metrics'
import { ContractMetric } from 'common/contract-metric'
import { ScheduleGame } from 'common/sports-schedule'
import { formatMoney } from 'common/util/format'

/** Shares (or mana) below this round to Ṁ0 and are not shown. */
export const MIN_STAKE = 0.5

const finite = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0

/** What the signed-in account holds on one game, as loaded from the API. */
export type GamePositions = {
  /**
   * Per-answer metrics (summary rows are excluded), including sold-out
   * answers: they hold no shares but carry realised profit.
   */
  metrics: ContractMetric[]
  /** The account's open limit orders on the game. */
  orders: LimitBet[]
}

export type OutcomeOrder = {
  /** Mana still unfilled. */
  amount: number
  /** Price of the outcome this line backs, 0–1. */
  prob: number
  /** A NO order in a three-way game: pays if this outcome loses. */
  against: boolean
}

/** The account's stake on one outcome (a team, or the draw). */
export type OutcomeStake = {
  answerId: string
  /**
   * Mana paid out if this outcome wins: YES shares on it plus NO shares on
   * the other outcomes (a game market has exactly one winner).
   */
  payoutIfWins: number
  orders: OutcomeOrder[]
}

export type GameStake = {
  byAnswer: Record<string, OutcomeStake>
  /** Current cost basis of the shares held. */
  invested: number
  /** What the shares are worth at the current prices. */
  value: number
  /** Mark-to-market profit: value plus sales minus purchases. */
  profit: number
  hasShares: boolean
  openOrders: number
  /** Mana still unfilled across the open orders. */
  unfilled: number
}

type GameAnswers = Pick<ScheduleGame, 'home' | 'away' | 'draw'>

export const gameAnswerIds = (game: GameAnswers) => [
  game.home.answerId,
  game.away.answerId,
  ...(game.draw ? [game.draw.answerId] : []),
]

const answerProb = (game: GameAnswers, answerId: string) =>
  answerId === game.home.answerId
    ? game.home.prob
    : answerId === game.away.answerId
    ? game.away.prob
    : game.draw?.answerId === answerId
    ? game.draw.prob
    : undefined

export const isOpenOrder = (bet: LimitBet, now = Date.now()) =>
  !bet.isFilled && !bet.isCancelled && (!bet.expiresAt || bet.expiresAt > now)

/** Whether the account is paid if this outcome wins. */
export const backsOutcome = (stake: OutcomeStake | undefined) =>
  !!stake && stake.payoutIfWins >= MIN_STAKE

export const hasOutcomeStake = (stake: OutcomeStake | undefined) =>
  backsOutcome(stake) || (stake?.orders.length ?? 0) > 0

/**
 * The account's stake on a game, from its per-answer metrics and open orders.
 *
 * Game markets are sum-to-one: when an answer wins, every other answer
 * resolves NO. So the payout if an outcome wins is the YES shares held on it
 * plus the NO shares held on the others; in a two-team game, NO on one team
 * is the same bet as YES on the other (how the versus ticket stores a bet on
 * the second team). Value and profit are marked to the prices on the game.
 * Returns undefined when the account has nothing on the game.
 */
export function getGameStake(
  game: GameAnswers,
  positions: GamePositions | undefined,
  now = Date.now()
): GameStake | undefined {
  if (!positions) return undefined
  const ids = gameAnswerIds(game)
  const byAnswer: Record<string, OutcomeStake> = Object.fromEntries(
    ids.map((id) => [id, { answerId: id, payoutIfWins: 0, orders: [] }])
  )

  let invested = 0
  let value = 0
  let profit = 0
  for (const metric of positions.metrics) {
    const { answerId } = metric
    if (!answerId || !ids.includes(answerId)) continue
    // Only live shares pay out, but a sold-out answer still carries the
    // profit (or loss) it realised, which belongs in the game's total.
    if (metric.hasShares) {
      const yes = finite(metric.totalShares?.YES)
      const no = finite(metric.totalShares?.NO)
      for (const id of ids) {
        byAnswer[id].payoutIfWins += id === answerId ? yes : no
      }
    }
    const prob = answerProb(game, answerId)
    const current =
      prob === undefined || !Number.isFinite(prob)
        ? metric
        : calculateProfitMetricsAtProbOrCancel(prob, metric)
    invested += finite(current.invested)
    value += finite(current.payout)
    profit += finite(current.profit)
  }

  const twoWay = !game.draw
  let openOrders = 0
  let unfilled = 0
  for (const order of positions.orders) {
    const { answerId } = order
    if (!answerId || !ids.includes(answerId) || !isOpenOrder(order, now))
      continue
    const amount = finite(order.orderAmount) - finite(order.amount)
    if (amount < MIN_STAKE) continue
    const limitProb = finite(order.limitProb)
    const yes = order.outcome === 'YES'
    // A NO order on one of two teams backs the other at the complementary price.
    const other = ids.find((id) => id !== answerId)
    const target = yes || !twoWay || !other ? answerId : other
    byAnswer[target].orders.push({
      amount,
      // Orders are at whole percentage points; keep the complement on them too.
      prob:
        yes || target === answerId
          ? limitProb
          : Math.round((1 - limitProb) * 100) / 100,
      against: !yes && target === answerId,
    })
    openOrders += 1
    unfilled += amount
  }

  const hasShares = ids.some((id) => byAnswer[id].payoutIfWins >= MIN_STAKE)
  if (!hasShares && openOrders === 0) return undefined
  return {
    byAnswer,
    invested: finite(invested),
    value: finite(value),
    profit: finite(profit),
    hasShares,
    openOrders,
    unfilled: finite(unfilled),
  }
}

/**
 * Merge a full re-read into what's held: per game, the re-read wins unless
 * that game was updated (targeted re-read, broadcast) after the full read
 * started, in which case the newer data stays. `touchedAt` is keyed by game.
 */
export function mergeFullRefresh<T>(
  held: Record<string, T>,
  fetched: Record<string, T>,
  ids: string[],
  startedAt: number,
  touchedAt: ReadonlyMap<string, number>
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of ids) {
    const touched = touchedAt.get(id)
    const fresh =
      touched !== undefined && touched > startedAt ? held[id] : fetched[id]
    if (fresh !== undefined) out[id] = fresh
  }
  return out
}

/**
 * A signed profit for display: "+Ṁ12" in green, "-Ṁ12" in red, and a plain
 * "Ṁ0" for anything that rounds to nothing (no "-Ṁ0").
 */
export function profitLabel(profit: number) {
  const amount = Number.isFinite(profit) ? profit : 0
  if (Math.abs(amount) < MIN_STAKE)
    return { text: formatMoney(0), className: 'text-ink-500' }
  return amount > 0
    ? { text: `+${formatMoney(amount)}`, className: 'text-green-600' }
    : { text: `-${formatMoney(-amount)}`, className: 'text-red-500' }
}

/** Totals across several games, for the My bets filter's summary line. */
export function sumGameStakes(stakes: GameStake[]) {
  let invested = 0
  let value = 0
  let profit = 0
  let openOrders = 0
  let games = 0
  for (const stake of stakes) {
    invested += stake.invested
    value += stake.value
    profit += stake.profit
    openOrders += stake.openOrders
    games += 1
  }
  return { games, invested, value, profit, openOrders }
}
