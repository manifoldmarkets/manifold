import { OutcomeType } from 'common/contract'
import { answerCostTiers, liquidityTiers } from './tier'

export const DEFAULT_CASH_ANTE = 50
export const MINIMUM_BOUNTY = 1000

export const getAnte = (
  outcomeType: OutcomeType,
  numAnswers: number | undefined,
  liquidityTier: number // this could be 100, 1000, 10000, 100000 (aka tiers)
) => {
  if (outcomeType === 'POLL') {
    return 10
  }

  if (outcomeType === 'MULTIPLE_CHOICE') {
    const tierIndex =
      liquidityTiers.findIndex((tier) => tier >= liquidityTier) ??
      liquidityTiers[liquidityTiers.length - 1]
    return numAnswers
      ? Math.max(numAnswers * answerCostTiers[tierIndex], liquidityTier)
      : liquidityTiers[tierIndex]
  }

  return liquidityTier
}

/* Sweeps bonuses */
export const KYC_VERIFICATION_BONUS_CASH = 3
export const BETTING_STREAK_SWEEPS_BONUS_AMOUNT = 0.05
export const BETTING_STREAK_SWEEPS_BONUS_MAX = 0.25

/* Mana bonuses */
export const STARTING_BALANCE = 1000
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

export const MANACHAN_TWEET_COST = 250
export const PUSH_NOTIFICATION_BONUS = 1000
export const BURN_MANA_USER_ID = 'SlYWAUtOzGPIYyQfXfvmHPt8eu22'

const PaymentAmounts = [
  {
    mana: 500,
    priceInDollars: 5,
    bonusInDollars: 0,
    devStripeId: 'price_1QrTemGdoFKoCJW7meXJDJLt',
    prodStripeId: 'price_1QrTeRGdoFKoCJW7I0AZVVIm',
  },
  {
    mana: 2_500,
    priceInDollars: 25,
    bonusInDollars: 0,
    devStripeId: 'price_1QrTUhGdoFKoCJW7VIWwpLD8',
    prodStripeId: 'price_1QrTRIGdoFKoCJW776dK3ZDo',
  },
  {
    mana: 11_000,
    priceInDollars: 100,
    bonusInDollars: 0,
    devStripeId: 'price_1QrTU0GdoFKoCJW7OLzDtdaM',
    prodStripeId: 'price_1QrTPCGdoFKoCJW7aXHQAGy4',
  },
  {
    mana: 120_000,
    priceInDollars: 1_000,
    bonusInDollars: 0,
    devStripeId: 'price_1QrTT7GdoFKoCJW79y4VgggM',
    prodStripeId: 'price_1N0TeXGdoFKoCJW7htfCrFd7',
  },
]
export type PaymentAmount = (typeof PaymentAmounts)[number] & {
  sku?: string
}

export const WEB_PRICES = PaymentAmounts

export type WebPriceInDollars =
  (typeof PaymentAmounts)[number]['priceInDollars']
// TODO: these prices should be a function of whether the user is sweepstakes verified or not
export const IOS_PRICES = [
  {
    mana: 1_000,
    priceInDollars: 14.99,
    bonusInDollars: 0,
    sku: 'mana_1000',
  },
  {
    mana: 2_500,
    priceInDollars: 35.99,
    bonusInDollars: 0,
    sku: 'mana_2500',
  },
  {
    mana: 10_000,
    priceInDollars: 142.99,
    bonusInDollars: 0,
    sku: 'mana_10000',
  },
] as PaymentAmount[]
export const MANI_IOS_PRICES = [
  {
    mana: 1000,
    priceInDollars: 9.99,
    bonusInDollars: 0,
    sku: 'S10',
  },
  {
    mana: 2500,
    priceInDollars: 24.99,
    bonusInDollars: 0,
    sku: 'S25',
  },
  {
    mana: 10000,
    priceInDollars: 99.99,
    bonusInDollars: 0,
    sku: 'S100',
  },
] as PaymentAmount[]

export const SWEEPIES_CASHOUT_FEE = 5
export const MIN_CASHOUT_AMOUNT = 25

export const SWEEPS_MIN_BET = 1
export const MANA_MIN_BET = 1
export const PROFIT_FEE_FRACTION = 0.1
export const BOOST_COST_MANA = 10000
export const DEV_BOOST_STRIPE_PRICE_ID = 'price_1QuI5BGdoFKoCJW7lMjCIuKW'
export const PROD_BOOST_STRIPE_PRICE_ID = 'price_1QuItEGdoFKoCJW7t9qtiGoD'
