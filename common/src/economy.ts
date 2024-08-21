import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  OutcomeType,
} from 'common/contract'
import { MarketTierType, tiers } from './tier'

export const FIXED_ANTE = 1000
const BASE_ANSWER_COST = FIXED_ANTE / 10
const ANTES = {
  BINARY: FIXED_ANTE,
  MULTIPLE_CHOICE: BASE_ANSWER_COST, // Amount per answer.
  FREE_RESPONSE: BASE_ANSWER_COST, // Amount per answer.
  PSEUDO_NUMERIC: FIXED_ANTE * 2.5,
  STONK: FIXED_ANTE,
  BOUNTIED_QUESTION: 0,
  POLL: FIXED_ANTE / 10,
  NUMBER: FIXED_ANTE * 10,
}

export const getTieredAnswerCost = (marketTier: MarketTierType | undefined) => {
  return marketTier
    ? BASE_ANSWER_COST * 10 ** (tiers.indexOf(marketTier) - 1)
    : BASE_ANSWER_COST
}

export const MINIMUM_BOUNTY = 10000
export const MULTIPLE_CHOICE_MINIMUM_COST = 1000

export const getAnte = (
  outcomeType: OutcomeType,
  numAnswers: number | undefined
) => {
  const ante = ANTES[outcomeType as keyof typeof ANTES] ?? FIXED_ANTE

  if (outcomeType === 'MULTIPLE_CHOICE') {
    return Math.max(ante * (numAnswers ?? 0), MULTIPLE_CHOICE_MINIMUM_COST)
  }

  return ante
}
export const getTieredCost = (
  baseCost: number,
  tier: MarketTierType | undefined,
  outcomeType: OutcomeType
) => {
  if (CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES.includes(outcomeType)) {
    return baseCost
  }

  const tieredCost = tier
    ? baseCost * 10 ** (tiers.indexOf(tier) - 1)
    : baseCost

  if (outcomeType == 'NUMBER' && tier != 'basic' && tier != 'play') {
    return tieredCost / 10
  }

  return tieredCost
}

export const STARTING_BALANCE = 100
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = 10

export const PHONE_VERIFICATION_BONUS = 1000
export const KYC_VERIFICATION_BONUS = 1000

export const REFERRAL_AMOUNT = 1000

// bonuses disabled
export const NEXT_DAY_BONUS = 100 // Paid on day following signup
export const MARKET_VISIT_BONUS = 100 // Paid on first distinct 5 market visits
export const MARKET_VISIT_BONUS_TOTAL = 500
export const UNIQUE_BETTOR_BONUS_AMOUNT = 5
export const SMALL_UNIQUE_BETTOR_BONUS_AMOUNT = 1
export const UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT = 5
export const UNIQUE_BETTOR_LIQUIDITY = 20
export const SMALL_UNIQUE_BETTOR_LIQUIDITY = 5
export const MAX_TRADERS_FOR_BIG_BONUS = 50
export const MAX_TRADERS_FOR_BONUS = 10000

export const SUBSIDY_FEE = 0

export const BETTING_STREAK_BONUS_AMOUNT = 50
export const BETTING_STREAK_BONUS_MAX = 250
export const BETTING_STREAK_RESET_HOUR = 7

export const MANACHAN_TWEET_COST = 2500
export const PUSH_NOTIFICATION_BONUS = 1000
export const BURN_MANA_USER_ID = 'SlYWAUtOzGPIYyQfXfvmHPt8eu22'
