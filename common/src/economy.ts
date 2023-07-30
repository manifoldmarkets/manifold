import { OutcomeType } from 'common/contract'

export const FIXED_ANTE = 50
export const ANSWER_COST = FIXED_ANTE / 2
const ANTES = {
  BINARY: FIXED_ANTE,
  MULTIPLE_CHOICE: ANSWER_COST, // Amount per answer.
  FREE_RESPONSE: ANSWER_COST,
  PSEUDO_NUMERIC: FIXED_ANTE * 5,
  NUMERIC: FIXED_ANTE * 5,
  CERT: FIXED_ANTE * 10,
  QUADRATIC_FUNDING: FIXED_ANTE * 10,
  STONK: FIXED_ANTE,
  BOUNTIED_QUESTION: 0,
}

export const getAnte = (
  outcomeType: OutcomeType,
  numAnswers: number | undefined
) => {
  const ante = ANTES[outcomeType as keyof typeof ANTES] ?? FIXED_ANTE

  if (outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'FREE_RESPONSE') {
    return ante * (numAnswers ?? 0)
  }

  return ante
}

export const STARTING_BALANCE = 500
export const STARTING_BONUS = 500
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = 10

export const REFERRAL_AMOUNT = 250

export const UNIQUE_BETTOR_BONUS_AMOUNT = 5
export const UNIQUE_BETTOR_LIQUIDITY = 20
export const MAX_TRADERS_FOR_BONUS = 100

export const BETTING_STREAK_BONUS_AMOUNT = 5
export const BETTING_STREAK_BONUS_MAX = 25
export const BETTING_STREAK_RESET_HOUR = 7

export const MANACHAN_TWEET_COST = 250
