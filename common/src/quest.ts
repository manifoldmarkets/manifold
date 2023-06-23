export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
  'ARCHAEOLOGIST',
  'REFERRALS',
] as const
export type QuestType = typeof QUEST_TYPES[number]

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
    rewardAmount: 25,
    scoreId: 'questionsCreatedThisWeek',
    title: 'Question Creation',
  },
  ARCHAEOLOGIST: {
    requiredCount: 1,
    rewardAmount: 25,
    scoreId: 'oldContractsBetOnThisWeek',
    title: 'Archaeologist',
  },
  REFERRALS: {
    requiredCount: 1,
    rewardAmount: 250,
    scoreId: 'referralsThisWeek',
    title: 'Referrals',
  },
}
export const QUEST_SCORE_IDS = QUEST_TYPES.map((t) => QUEST_DETAILS[t].scoreId)
