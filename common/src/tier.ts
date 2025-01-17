import {
  CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES,
  MarketContract,
  OutcomeType,
} from './contract'
import { BASE_ANSWER_COST, getAnte, MIN_ANSWER_COST } from './economy'

// Array of tiers in order
export const tiers = ['play', 'plus', 'premium', 'crystal'] as const

export type BinaryDigit = '0' | '1'

export type TierParamsType =
  `${BinaryDigit}${BinaryDigit}${BinaryDigit}${BinaryDigit}${BinaryDigit}`

// Derive the MarketTierType from the array
export type MarketTierType = (typeof tiers)[number]

export const getTieredAnswerCost = (marketTier: MarketTierType | undefined) => {
  return marketTier
    ? Math.max(
        BASE_ANSWER_COST * 10 ** (tiers.indexOf(marketTier) - 1),
        MIN_ANSWER_COST
      )
    : BASE_ANSWER_COST
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

// For multi & mumeric markets this can only get the current tier, not back-calculate
export function getTierFromLiquidity(
  contract: MarketContract,
  liquidity: number
): MarketTierType {
  const { outcomeType } = contract

  let numAnswers = undefined
  if ('answers' in contract) {
    numAnswers = contract.answers.length
  }

  const ante = getAnte(outcomeType, numAnswers)

  // Iterate through the tiers from highest to lowest
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]
    const tierLiquidity = getTieredCost(ante, tier, outcomeType)

    // Return the first tier where the liquidity is greater or equal to the tier's requirement
    if (liquidity >= tierLiquidity) {
      return tier as MarketTierType
    }
  }
  // Default to the lowest tier if none of the conditions are met
  return 'play'
}
