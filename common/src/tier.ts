import {
  CPMMContract,
  CPMMMultiContract,
  CPMMNumericContract,
} from './contract'
import { getAnte, getTieredCost } from './economy'

// Array of tiers in order
export const tiers = ['play', 'basic', 'plus', 'premium', 'crystal'] as const

// Derive the MarketTierType from the array
export type MarketTierType = (typeof tiers)[number]

export const MARKET_TIER_MULTIPLES: Record<MarketTierType, number> = {
  play: 0.1,
  basic: 1,
  plus: 10,
  premium: 100,
  crystal: 1000,
}

export function getTierFromLiquidity(
  contract: CPMMContract | CPMMMultiContract | CPMMNumericContract,
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
