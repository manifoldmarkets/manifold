import { uniq } from 'lodash'
import { pacificStartOfDayMs } from 'common/streak-snapshot'
import { DAY_MS, HOUR_MS } from 'common/util/time'

export const QUEST_TYPES = [
  'BETTING_STREAK',
  'SHARES',
  'MARKETS_CREATED',
  'MARKETS_CREATED_3',
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
  MARKETS_CREATED_3: {
    requiredCount: 3,
    rewardAmount: 100,
    scoreId: 'marketsCreatedThisWeek',
    title: 'Three Questions',
  },
}
export const QUEST_SCORE_IDS = uniq(
  QUEST_TYPES.map((t) => QUEST_DETAILS[t].scoreId)
)

// Weekly quests counted from the questions a user created this week. Each pays
// at most once per week, as soon as the count reaches its requiredCount.
export const MARKET_CREATION_QUESTS: QuestType[] = [
  'MARKETS_CREATED',
  'MARKETS_CREATED_3',
]

const PACIFIC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Monday 00:00 America/Los_Angeles of the week containing `now`, in epoch ms:
 * the period of the weekly quests, matching the scheduler's Monday-midnight
 * reset-weekly-quests-stats job. A Pacific day is 23 or 25 hours long on the
 * DST transitions, so stepping back whole days only gets near Monday's
 * midnight; step to Monday midday instead and snap to that day's start.
 */
export function getQuestWeekStart(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
  }).format(now)
  const dayIndex = PACIFIC_WEEKDAYS.indexOf(weekday)
  if (dayIndex === -1) throw new Error(`Unexpected weekday: ${weekday}`)
  const daysSinceMonday = (dayIndex + 6) % 7
  const todayStart = pacificStartOfDayMs(now)
  return pacificStartOfDayMs(
    new Date(todayStart - daysSinceMonday * DAY_MS + 12 * HOUR_MS)
  )
}

/** The Monday 00:00 Pacific that ends the quest week starting at `weekStart`. */
export function getNextQuestWeekStart(weekStart: number): number {
  return getQuestWeekStart(new Date(weekStart + 8 * DAY_MS))
}
