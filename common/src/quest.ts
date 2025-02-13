export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
] as const
export type QuestType = (typeof QUEST_TYPES)[number]

export const QUEST_DETAILS: Record<
  QuestType,
  {
    requiredCount: number
    rewardAmount: number
    scoreId: string
    title: string
  }
> = {
  BETTING_STREAK: {
    requiredCount: 1,
    rewardAmount: 25,
    scoreId: 'currentBettingStreak',
    title: 'Prediction Streak',
  },
  SHARES: {
    requiredCount: 1,
    rewardAmount: 5,
    scoreId: 'sharesToday',
    title: 'Sharing',
  },
  MARKETS_CREATED: {
    requiredCount: 1,
    rewardAmount: 100,
    scoreId: 'marketsCreatedThisWeek',
    title: 'Question Creation',
  },
}
export const QUEST_SCORE_IDS = QUEST_TYPES.map((t) => QUEST_DETAILS[t].scoreId)
