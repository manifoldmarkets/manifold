import { Answer } from './answer'
import { Bet } from './bet'
import { Contract, isBinaryMulti } from './contract'
import { ContractMetric } from './contract-metric'

/**
 * Helpers for "versus" markets: two-answer, sum-to-one multiple choice
 * markets with adding answers disabled (see `isBinaryMulti`). Note that this
 * is inferred from the market's shape rather than declared on the contract.
 *
 * The UI presents such a market as a single binary question about the main
 * (first) answer: YES means the main answer wins, NO means the second answer
 * wins. A bet, however, is stored against an answer id with a YES or NO
 * outcome, so the same position has two representations:
 *
 *   YES on the main answer  ==  NO on the second answer   (backing main)
 *   NO on the main answer   ==  YES on the second answer  (backing second)
 *
 * Prices are per answer: a bet's probBefore/probAfter/limitProb describe the
 * answer the bet was placed on, not the main answer.
 *
 * Everything that displays a versus bet, order, or position should go through
 * these helpers rather than reading `bet.outcome` directly.
 */

export type VersusOutcome = 'YES' | 'NO'

export type VersusAnswers = {
  /** The first answer. The versus UI treats it as the YES side. */
  main: Answer
  /** The second answer. The versus UI treats it as the NO side. */
  other: Answer
}

/** The two answers of a versus market, or undefined if this isn't one. */
export const getVersusAnswers = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>
): VersusAnswers | undefined => {
  if (
    contract.mechanism !== 'cpmm-multi-1' ||
    !isBinaryMulti(contract as Contract)
  )
    return undefined
  const [main, other] = (contract as { answers: Answer[] }).answers
  if (!main || !other) return undefined
  return { main, other }
}

export type VersusSide = {
  /** The answer the bettor is backing (or, for a sell, the position sold). */
  answer: Answer
  /** The answer the bettor is betting against. */
  opponent: Answer
  /**
   * The side relative to the main answer: 'YES' when backing the main answer,
   * 'NO' when backing the second answer. This is what the versus UI's
   * YES/NO pseudonyms, colors and columns are keyed by.
   */
  sideOutcome: VersusOutcome
  /** Whether the bet is stored against the main answer. */
  isOnMainAnswer: boolean
  /** Current probability of the backed answer. */
  prob: number
}

/**
 * Canonicalises a bet, limit order, or position on a versus market to the
 * side of the main answer it is backing. Returns undefined when the contract
 * is not a versus market or the answer id doesn't belong to it.
 *
 * Bets without an answer id are treated as bets on the main answer.
 */
export const versusSide = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  bet: { answerId?: string | null; outcome: string }
): VersusSide | undefined => {
  const answers = getVersusAnswers(contract)
  if (!answers) return undefined
  const { main, other } = answers

  const isOnMainAnswer = !bet.answerId || bet.answerId === main.id
  if (!isOnMainAnswer && bet.answerId !== other.id) return undefined

  const backsMain = isOnMainAnswer === (bet.outcome === 'YES')
  const answer = backsMain ? main : other
  return {
    answer,
    opponent: backsMain ? other : main,
    sideOutcome: backsMain ? 'YES' : 'NO',
    isOnMainAnswer,
    prob: answer.prob,
  }
}

/** The side outcome (relative to the main answer) of a versus bet. */
export const versusSideOutcome = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  bet: { answerId?: string | null; outcome: string }
): VersusOutcome | undefined => versusSide(contract, bet)?.sideOutcome

/**
 * Converts a price quoted for the answer a bet was placed on into the
 * probability of the side the bettor is backing. A YES bet backs the answer
 * at its price; a NO bet backs the other answer at one minus that price.
 * This does not depend on which answer the bet was stored against.
 */
export const versusSideProb = (outcome: string, prob: number) =>
  outcome === 'YES' ? prob : 1 - prob

/**
 * The probabilities of a bet or limit order, expressed as the probability of
 * the side the bettor is backing (what the versus UI should display).
 */
export const getVersusBetProbs = (
  bet: Pick<Bet, 'outcome' | 'probBefore' | 'probAfter'> & {
    limitProb?: number
  }
) => ({
  probBefore: versusSideProb(bet.outcome, bet.probBefore),
  probAfter: versusSideProb(bet.outcome, bet.probAfter),
  limitProb:
    bet.limitProb === undefined
      ? undefined
      : versusSideProb(bet.outcome, bet.limitProb),
})

/**
 * Expresses a limit order in terms of the main answer: the side it backs and
 * the main answer's probability at which it fills. Orders stored against the
 * second answer are mirrored (their price is the second answer's price).
 */
export const toMainAnswerOrder = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  bet: { answerId?: string | null; outcome: string; limitProb: number }
): { outcome: VersusOutcome; limitProb: number } | undefined => {
  const side = versusSide(contract, bet)
  if (!side) return undefined
  return {
    outcome: side.sideOutcome,
    // Limit orders use whole percentage points. Normalize the complement so
    // equivalent orders share a price key (1 - 0.7 is not exactly 0.3).
    limitProb: side.isOnMainAnswer
      ? bet.limitProb
      : Math.round((1 - bet.limitProb) * 100) / 100,
  }
}

/** Splits bets into those backing the main answer and those backing the second. */
export const partitionVersusBets = <
  T extends Pick<Bet, 'answerId' | 'outcome'>
>(
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  bets: T[]
): [T[], T[]] => {
  const yesSide: T[] = []
  const noSide: T[] = []
  for (const bet of bets) {
    const side = versusSide(contract, bet)
    if (!side) continue
    if (side.sideOutcome === 'YES') yesSide.push(bet)
    else noSide.push(bet)
  }
  return [yesSide, noSide]
}

export type VersusShares = {
  /** Shares paying out if the main answer wins. */
  yesShares: number
  /** Shares paying out if the second answer wins. */
  noShares: number
  hasYesShares: boolean
  hasNoShares: boolean
  /** The side with more shares, or undefined when holding neither. */
  sharesOutcome: VersusOutcome | undefined
}

/**
 * A user's position on a versus market, summed over per-answer contract
 * metrics and expressed relative to the main answer. YES shares on the
 * second answer count as NO shares on the main answer and vice versa.
 * Summary metrics (answerId null) are ignored because they mix both answers.
 */
export const getVersusShares = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  metrics: Pick<ContractMetric, 'answerId' | 'totalShares'>[] | undefined
): VersusShares => {
  let yesShares = 0
  let noShares = 0
  for (const metric of metrics ?? []) {
    if (!metric.answerId) continue
    const yesSide = versusSide(contract, {
      answerId: metric.answerId,
      outcome: 'YES',
    })
    if (!yesSide) continue
    const yes = metric.totalShares?.YES ?? 0
    const no = metric.totalShares?.NO ?? 0
    if (yesSide.sideOutcome === 'YES') {
      yesShares += yes
      noShares += no
    } else {
      yesShares += no
      noShares += yes
    }
  }
  const hasYesShares = yesShares >= 1
  const hasNoShares = noShares >= 1
  const sharesOutcome =
    !hasYesShares && !hasNoShares
      ? undefined
      : yesShares >= noShares
      ? 'YES'
      : 'NO'
  return { yesShares, noShares, hasYesShares, hasNoShares, sharesOutcome }
}

/**
 * Re-expresses a per-answer contract metric relative to the main answer, so
 * metrics stored against the second answer can be listed alongside those on
 * the main answer. Metrics already on the main answer are returned as is.
 */
export const toMainAnswerMetric = <
  T extends Pick<
    ContractMetric,
    | 'answerId'
    | 'totalShares'
    | 'hasYesShares'
    | 'hasNoShares'
    | 'maxSharesOutcome'
    | 'totalSpent'
    | 'lastProb'
  >
>(
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  metric: T
): T => {
  const answers = getVersusAnswers(contract)
  if (!answers || metric.answerId !== answers.other.id) return metric
  const flip = (shares: { [outcome: string]: number } | undefined) =>
    shares && {
      ...shares,
      YES: shares.NO ?? 0,
      NO: shares.YES ?? 0,
    }
  return {
    ...metric,
    answerId: answers.main.id,
    totalShares: flip(metric.totalShares) ?? {},
    totalSpent: flip(metric.totalSpent),
    lastProb: metric.lastProb == null ? metric.lastProb : 1 - metric.lastProb,
    hasYesShares: metric.hasNoShares,
    hasNoShares: metric.hasYesShares,
    maxSharesOutcome:
      metric.maxSharesOutcome === 'YES'
        ? 'NO'
        : metric.maxSharesOutcome === 'NO'
        ? 'YES'
        : metric.maxSharesOutcome,
  }
}

/**
 * Merges the per-answer contract metrics of a versus market into one metric
 * per user, expressed relative to the main answer, so positions stored on
 * either answer can be listed together. Summary metrics (answerId null) are
 * dropped; duplicate rows for the same user and answer are collapsed first.
 */
export const mergeVersusMetricsByUser = (
  contract: Pick<Contract, 'mechanism' | 'outcomeType'> & Partial<Contract>,
  metrics: ContractMetric[]
): ContractMetric[] => {
  const answers = getVersusAnswers(contract)
  if (!answers) return metrics
  const seen = new Set<string>()
  const byUser = new Map<string, ContractMetric>()
  for (const metric of metrics) {
    if (!metric.answerId) continue
    const key = metric.userId + '|' + metric.answerId
    if (seen.has(key)) continue
    seen.add(key)
    const remapped = toMainAnswerMetric(contract, metric)
    const existing = byUser.get(metric.userId)
    if (!existing) {
      byUser.set(metric.userId, remapped)
      continue
    }
    const yes =
      (existing.totalShares?.YES ?? 0) + (remapped.totalShares?.YES ?? 0)
    const no = (existing.totalShares?.NO ?? 0) + (remapped.totalShares?.NO ?? 0)
    const latest =
      remapped.lastBetTime > existing.lastBetTime ? remapped : existing
    byUser.set(metric.userId, {
      ...existing,
      totalShares: { ...existing.totalShares, YES: yes, NO: no },
      totalSpent:
        existing.totalSpent || remapped.totalSpent
          ? {
              YES:
                (existing.totalSpent?.YES ?? 0) +
                (remapped.totalSpent?.YES ?? 0),
              NO:
                (existing.totalSpent?.NO ?? 0) + (remapped.totalSpent?.NO ?? 0),
            }
          : undefined,
      hasYesShares: yes >= 1,
      hasNoShares: no >= 1,
      hasShares: existing.hasShares || remapped.hasShares,
      maxSharesOutcome: yes >= no ? 'YES' : 'NO',
      invested: existing.invested + remapped.invested,
      payout: existing.payout + remapped.payout,
      profit: existing.profit + remapped.profit,
      totalAmountInvested:
        existing.totalAmountInvested + remapped.totalAmountInvested,
      totalAmountSold: existing.totalAmountSold + remapped.totalAmountSold,
      lastBetTime: latest.lastBetTime,
      lastProb: latest.lastProb,
    })
  }
  return Array.from(byUser.values())
}
