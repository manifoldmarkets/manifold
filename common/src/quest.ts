import { User } from 'common/user'

export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
] as const
export type QuestType = typeof QUEST_TYPES[number]
export const QUEST_DETAILS: Record<
  QuestType,
  {
    requiredCount: number
    rewardAmount: number
    userKey: keyof Pick<
      User,
      'currentBettingStreak' | 'sharesThisWeek' | 'marketsCreatedThisWeek'
    >
    title: string
  }
> = {
  BETTING_STREAK: {
    requiredCount: 1,
    rewardAmount: 25,
    userKey: 'currentBettingStreak',
    title: 'Prediction Streak',
  },
  SHARES: {
    requiredCount: 3,
    rewardAmount: 25,
    userKey: 'sharesThisWeek',
    title: 'Sharing',
  },
  MARKETS_CREATED: {
    requiredCount: 1,
    rewardAmount: 25,
    userKey: 'marketsCreatedThisWeek',
    title: 'Market Creation',
  },
}
