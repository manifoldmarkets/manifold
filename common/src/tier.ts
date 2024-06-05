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

export const MARKET_TIER_AMOUNTS: Record<MarketTierType, number> = {
  play: 100,
  basic: 1000,
  plus: 10000,
  premium: 100000,
  crystal: 1000000,
}

export function getTierFromLiquidity(liquidity: number): MarketTierType {
  // Iterate through the tiers from highest to lowest
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]
    // Return the first tier where the liquidity is greater or equal to the tier's requirement
    if (liquidity >= MARKET_TIER_AMOUNTS[tier]) {
      return tier as MarketTierType
    }
  }

  // Default to the lowest tier if none of the conditions are met
  return 'play'
}
