import { useEffect } from 'react'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { NativeQuestItem } from 'common/native-message'
import { getQuestScores } from 'common/supabase/set-scores'
import { db } from 'web/lib/supabase/db'
import { nativeSetQuests } from 'web/lib/native/native-messages'

// The secondary quests shown as rows on the widget. The betting-streak quest is
// the widget's main display, so it's deliberately omitted here. Titles are the
// action-oriented widget labels (not the internal QUEST_DETAILS titles).
const WIDGET_QUESTS: {
  type: QuestType
  title: string
  period: 'daily' | 'weekly'
}[] = [
  { type: 'SHARES', title: 'Share a market', period: 'daily' },
  { type: 'MARKETS_CREATED', title: 'Create a market', period: 'weekly' },
]

// Native-only: fetch the (binary) quest completion once per session and push it
// to the streak widget. The widget assumes "not done" once a period rolls over
// (daily at midnight PT, weekly on Monday), so this single fetch stays correct
// across the day without refetching. Gated on `isNative` so web users never
// incur the extra user_quest_metrics query.
export const useNativeQuestSync = (
  userId: string | undefined,
  isNative: boolean
) => {
  useEffect(() => {
    if (!isNative || !userId) return
    let cancelled = false
    const scoreIds = WIDGET_QUESTS.map((q) => QUEST_DETAILS[q.type].scoreId)
    getQuestScores(userId, scoreIds, db)
      .then((scores) => {
        if (cancelled) return
        const quests: NativeQuestItem[] = WIDGET_QUESTS.map((q) => {
          const { scoreId, requiredCount, rewardAmount } = QUEST_DETAILS[q.type]
          return {
            title: q.title,
            rewardMana: rewardAmount,
            done: (scores[scoreId]?.score ?? 0) >= requiredCount,
            period: q.period,
          }
        })
        nativeSetQuests({ quests, updatedAt: Date.now() })
      })
      .catch((e) => console.error('Error syncing quests to widget', e))
    return () => {
      cancelled = true
    }
  }, [userId, isNative])
}
