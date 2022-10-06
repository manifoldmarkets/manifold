import { User } from './user'

export type Badge = {
  type: BadgeTypes
  createdTime: number
  data: { [key: string]: any }
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

export const streakerBadgeRarityThresholds = [1, 50, 125]
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

export const marketMakerBadgeRarityThresholds = [1, 50, 200]
const calculateMarketMakerBadgeRarity = (badge: MarketCreatorBadge) => {
  const { totalContractsCreated } = badge.data
  const thresholdArray = marketMakerBadgeRarityThresholds
  let i = thresholdArray.length - 1
  while (i >= 0) {
    if (totalContractsCreated == thresholdArray[i]) {
      return i + 1
    }
    i--
  }
  return 1
}

export type rarities = 'common' | 'bronze' | 'silver' | 'gold'

const rarityRanks: { [key: number]: rarities } = {
  0: 'common',
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
        calculateMarketMakerBadgeRarity(badge as MarketCreatorBadge)
      ]
    case 'STREAKER':
      return rarityRanks[calculateStreakerBadgeRarity(badge as StreakerBadge)]
    default:
      return rarityRanks[0]
  }
}

export const calculateTotalUsersBadges = (user: User) => {
  const { achievements } = user
  if (!achievements) return 0
  return (
    (achievements.marketCreator?.totalBadges ?? 0) +
    (achievements.provenCorrect?.totalBadges ?? 0) +
    (achievements.streaker?.totalBadges ?? 0)
  )
}
