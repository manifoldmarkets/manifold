import { User } from './user'

export type Badge = {
  type: BadgeTypes
  createdTime: number
  data: { [key: string]: any }
  name: 'Proven Correct' | 'Streaker' | 'Market Creator'
}

export type BadgeTypes = 'PROVEN_CORRECT' | 'STREAKER' | 'MARKET_CREATOR'

export type ProvenCorrectBadgeData = {
  type: 'PROVEN_CORRECT'
  data: {
    contractSlug: string
    contractCreatorUsername: string
    contractTitle: string
    commentId: string
    betAmount: number
  }
}

export type MarketCreatorBadgeData = {
  type: 'MARKET_CREATOR'
  data: {
    totalContractsCreated: number
  }
}

export type StreakerBadgeData = {
  type: 'STREAKER'
  data: {
    totalBettingStreak: number
  }
}

export type ProvenCorrectBadge = Badge & ProvenCorrectBadgeData
export type StreakerBadge = Badge & StreakerBadgeData
export type MarketCreatorBadge = Badge & MarketCreatorBadgeData

export const MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE = 5
export const provenCorrectRarityThresholds = [1, 1000, 10000]
const calculateProvenCorrectBadgeRarity = (badge: ProvenCorrectBadge) => {
  const { betAmount } = badge.data
  const thresholdArray = provenCorrectRarityThresholds
  let i = thresholdArray.length - 1
  while (i >= 0) {
    if (betAmount >= thresholdArray[i]) {
      return i + 1
    }
    i--
  }
  return 1
}

export const streakerBadgeRarityThresholds = [1, 50, 250]
const calculateStreakerBadgeRarity = (badge: StreakerBadge) => {
  const { totalBettingStreak } = badge.data
  const thresholdArray = streakerBadgeRarityThresholds
  let i = thresholdArray.length - 1
  while (i >= 0) {
    if (totalBettingStreak == thresholdArray[i]) {
      return i + 1
    }
    i--
  }
  return 1
}

export const marketCreatorBadgeRarityThresholds = [1, 75, 300]
const calculateMarketCreatorBadgeRarity = (badge: MarketCreatorBadge) => {
  const { totalContractsCreated } = badge.data
  const thresholdArray = marketCreatorBadgeRarityThresholds
  let i = thresholdArray.length - 1
  while (i >= 0) {
    if (totalContractsCreated == thresholdArray[i]) {
      return i + 1
    }
    i--
  }
  return 1
}

export type rarities = 'bronze' | 'silver' | 'gold'

const rarityRanks: { [key: number]: rarities } = {
  1: 'bronze',
  2: 'silver',
  3: 'gold',
}

export const calculateBadgeRarity = (badge: Badge) => {
  switch (badge.type) {
    case 'PROVEN_CORRECT':
      return rarityRanks[
        calculateProvenCorrectBadgeRarity(badge as ProvenCorrectBadge)
      ]
    case 'MARKET_CREATOR':
      return rarityRanks[
        calculateMarketCreatorBadgeRarity(badge as MarketCreatorBadge)
      ]
    case 'STREAKER':
      return rarityRanks[calculateStreakerBadgeRarity(badge as StreakerBadge)]
    default:
      return rarityRanks[0]
  }
}

export const getBadgesByRarity = (user: User) => {
  const rarities: { [key in rarities]: number } = {
    bronze: 0,
    silver: 0,
    gold: 0,
  }
  Object.values(user.achievements).map((value) => {
    value.badges.map((badge) => {
      rarities[calculateBadgeRarity(badge)] =
        (rarities[calculateBadgeRarity(badge)] ?? 0) + 1
    })
  })
  return rarities
}

export const goldClassName = 'text-amber-400'
export const silverClassName = 'text-gray-500'
export const bronzeClassName = 'text-amber-900'
