import { OutcomeType } from 'common/contract'

export const FIXED_ANTE = 100
export const ANSWER_COST = FIXED_ANTE / 2
const ANTES = {
  BINARY: FIXED_ANTE,
  MULTIPLE_CHOICE: ANSWER_COST, // Amount per answer.
  FREE_RESPONSE: ANSWER_COST, // Amount per answer.
  PSEUDO_NUMERIC: FIXED_ANTE * 2.5,
  STONK: FIXED_ANTE,
  BOUNTIED_QUESTION: 0,
  POLL: 100,
}

export const MINIMUM_BOUNTY = 100

export const getAnte = (
  outcomeType: OutcomeType,
  numAnswers: number | undefined
) => {
  const ante = ANTES[outcomeType as keyof typeof ANTES] ?? FIXED_ANTE

  if (outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE') {
    return Math.max(ante * (numAnswers ?? 0), 10)
  }

  return ante
}

export const getAnteBurn = (outcomeType: OutcomeType) => {
  if (outcomeType === 'BINARY') {
    return 25
  }
  return 0
}

export const STARTING_BALANCE = 100
export const NEXT_DAY_BONUS = 100 // Paid on day following signup
export const MARKET_VISIT_BONUS = 100 // Paid on first distinct 9 market visits
export const MARKET_VISIT_BONUS_TOTAL = 900
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = 10

export const REFERRAL_AMOUNT = 250

export const UNIQUE_BETTOR_BONUS_AMOUNT = 5
export const SMALL_UNIQUE_BETTOR_BONUS_AMOUNT = 1
export const UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT = 5
export const UNIQUE_BETTOR_LIQUIDITY = 20
export const SMALL_UNIQUE_BETTOR_LIQUIDITY = 5
export const MAX_TRADERS_FOR_BIG_BONUS = 50
export const MAX_TRADERS_FOR_BONUS = 10000

export const SUBSIDY_FEE = 0.25

export const BETTING_STREAK_BONUS_AMOUNT = 5
export const BETTING_STREAK_BONUS_MAX = 25
export const BETTING_STREAK_RESET_HOUR = 7

export const MANACHAN_TWEET_COST = 250
export const PUSH_NOTIFICATION_BONUS = 100
