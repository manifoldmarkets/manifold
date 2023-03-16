import { User } from 'common/user'
import { sum } from 'lodash'

export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
] as const
export type QuestType = typeof QUEST_TYPES[number]
export const QUEST_REWARD_DETAILS: Record<
  QuestType,
  {
    requiredCount: number
    rewardAmount: number
    key: keyof Pick<
      User,
      'currentBettingStreak' | 'sharesThisWeek' | 'marketsCreatedThisWeek'
    >
    title: string
  }
> = {
  BETTING_STREAK: {
    requiredCount: 5,
    rewardAmount: 25,
    key: 'currentBettingStreak',
    title: 'Prediction Streak',
  },
  SHARES: {
    requiredCount: 3,
    rewardAmount: 25,
    key: 'sharesThisWeek',
    title: 'Sharing',
  },
  MARKETS_CREATED: {
    requiredCount: 1,
    rewardAmount: 25,
    key: 'marketsCreatedThisWeek',
    title: 'Market Creation',
  },
}

export const getQuestCompletionStatus = (user: User) => {
  const questToCompletionStatus = Object.fromEntries(
    QUEST_TYPES.map((t) => [t, { requiredCount: 0, currentCount: 0 }])
  )

  for (const questType of QUEST_TYPES) {
    const questData = QUEST_REWARD_DETAILS[questType]
    questToCompletionStatus[questType] = {
      requiredCount: questData.requiredCount,
      currentCount: user[questData.key] ?? 0,
    }
  }
  const totalQuestsCompleted = sum(
    Object.keys(questToCompletionStatus)
      .map((k) => questToCompletionStatus[k])
      .map((v) => (v.currentCount >= v.requiredCount ? 1 : 0))
  )
  const totalQuests = Object.keys(questToCompletionStatus).length
  const allQuestsComplete = totalQuestsCompleted === totalQuests

  return {
    questToCompletionStatus,
    totalQuestsCompleted,
    totalQuests,
    allQuestsComplete,
  }
}
