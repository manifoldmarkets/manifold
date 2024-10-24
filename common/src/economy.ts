import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  OutcomeType,
} from 'common/contract'
import { MarketTierType, tiers } from './tier'
import { TWOMBA_ENABLED } from 'common/envs/constants'

export const FIXED_ANTE = 1000
const BASE_ANSWER_COST = FIXED_ANTE / 10
const MIN_ANSWER_COST = 25
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
    ? Math.max(
        BASE_ANSWER_COST * 10 ** (tiers.indexOf(marketTier) - 1),
        MIN_ANSWER_COST
      )
    : BASE_ANSWER_COST
}

export const MINIMUM_BOUNTY = 1000
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

  if (outcomeType == 'NUMBER' && tier != 'play') {
    return tieredCost / 10
  }

  return tieredCost
}

/* Sweeps bonuses */
export const KYC_VERIFICATION_BONUS_CASH = 1
export const BETTING_STREAK_SWEEPS_BONUS_AMOUNT = 0.05
export const BETTING_STREAK_SWEEPS_BONUS_MAX = 0.25

/* Mana bonuses */
export const STARTING_BALANCE = 100
// for sus users, i.e. multiple sign ups for same person
export const SUS_STARTING_BALANCE = 10
export const PHONE_VERIFICATION_BONUS = 1000

export const REFERRAL_AMOUNT = 1_000
export const REFERRAL_AMOUNT_CASH = 10.0
export const REFERRAL_MIN_PURCHASE_DOLLARS = 20

export const UNIQUE_BETTOR_BONUS_AMOUNT = 10
export const UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT = 10

/* Disabled bonuses */
export const NEXT_DAY_BONUS = 100 // Paid on day following signup
export const MARKET_VISIT_BONUS = 100 // Paid on first distinct 5 market visits
export const MARKET_VISIT_BONUS_TOTAL = 500
export const UNIQUE_BETTOR_LIQUIDITY = 20
export const SMALL_UNIQUE_BETTOR_LIQUIDITY = 5
export const MAX_TRADERS_FOR_BIG_BONUS = 50
export const MAX_TRADERS_FOR_BONUS = 10000

export const SUBSIDY_FEE = 0

export const BETTING_STREAK_BONUS_AMOUNT = 5
export const BETTING_STREAK_BONUS_MAX = 25
export const BETTING_STREAK_RESET_HOUR = 7

export const MANACHAN_TWEET_COST = 250
export const PUSH_NOTIFICATION_BONUS = 1000
export const BURN_MANA_USER_ID = 'SlYWAUtOzGPIYyQfXfvmHPt8eu22'

const PaymentAmounts = [
  {
    mana: 500,
    priceInDollars: 7,
    bonusInDollars: 0,
    devStripeId: 'price_1Q5vRAGdoFKoCJW7zk9OTWBK',
    prodStripeId: 'price_1Q5vLGGdoFKoCJW7Q9w7cK1u',
  },
  {
    mana: 1_000,
    priceInDollars: 15,
    bonusInDollars: 10,
  },
  {
    mana: 2_500,
    priceInDollars: 30,
    bonusInDollars: 25,
  },
  {
    mana: 5_000,
    priceInDollars: 55,
    bonusInDollars: 0,
    devStripeId: 'price_1Q5vaXGdoFKoCJW71l2OL31r',
    prodStripeId: 'price_1Q5vJjGdoFKoCJW7Ws09fJ4j',
  },
  {
    mana: 10_000,
    priceInDollars: 110,
    bonusInDollars: 100,
  },
  {
    mana: 100_000,
    priceInDollars: 1_000,
    bonusInDollars: 1000,
  },
  {
    mana: 1_000,
    originalPriceInDollars: 15,
    priceInDollars: 7,
    bonusInDollars: 10,
    newUsersOnly: true,
  },
  {
    mana: 5_000,
    originalPriceInDollars: 55,
    priceInDollars: 20,
    bonusInDollars: 40,
    newUsersOnly: true,
  },
]
export type PaymentAmount = (typeof PaymentAmounts)[number]

export const WEB_PRICES = PaymentAmounts

export type WebPriceInDollars =
  (typeof PaymentAmounts)[number]['priceInDollars']
// TODO: these prices should be a function of whether the user is sweepstakes verified or not
export const IOS_PRICES = TWOMBA_ENABLED
  ? [
      {
        mana: 1_000,
        priceInDollars: 14.99,
        bonusInDollars: 10,
        sku: 'mana_1000',
      },
      {
        mana: 2_500,
        priceInDollars: 35.99,
        bonusInDollars: 25,
        sku: 'mana_2500',
      },
      {
        mana: 10_000,
        priceInDollars: 142.99,
        bonusInDollars: 100,
        sku: 'mana_10000',
      },
      // No 1M option on ios: the fees are too high
    ]
  : [
      {
        mana: 10_000,
        priceInDollars: 14.99,
        bonusInDollars: 0,
        sku: 'mana_1000',
      },
      {
        mana: 25_000,
        priceInDollars: 35.99,
        bonusInDollars: 0,
        sku: 'mana_2500',
      },
      {
        mana: 100_000,
        priceInDollars: 142.99,
        bonusInDollars: 0,
        sku: 'mana_10000',
      },
      // No 1M option on ios: the fees are too high
    ]

export const SWEEPIES_CASHOUT_FEE = 0.05
export const MIN_CASHOUT_AMOUNT = 25

export const SWEEPS_MIN_BET = 1
export const MANA_MIN_BET = 1
