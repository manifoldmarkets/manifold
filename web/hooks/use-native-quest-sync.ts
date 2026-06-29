import { useEffect } from 'react'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { NativeQuestItem } from 'common/native-message'
import { getQuestScores } from 'common/supabase/set-scores'
import { db } from 'web/lib/supabase/db'
import { nativeSetQuests } from 'web/lib/native/native-messages'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useEvent } from 'client-common/hooks/use-event'

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

// Native-only: push the (binary) quest completion to the streak widget. Runs once
// when the user is known, and again whenever the native app foregrounds (the
// 'refreshQuests' message), so completing a quest reaches the widget without a
// full reload. Gated on `isNative` so web users never incur the extra
// user_quest_metrics query.
export const useNativeQuestSync = (
  userId: string | undefined,
  isNative: boolean
) => {
  const syncQuests = useEvent(async () => {
    if (!isNative || !userId) return
    const scoreIds = WIDGET_QUESTS.map((q) => QUEST_DETAILS[q.type].scoreId)
    try {
      const scores = await getQuestScores(userId, scoreIds, db)
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
    } catch (e) {
      console.error('Error syncing quests to widget', e)
    }
  })

  // Initial sync once the user / native status is known.
  useEffect(() => {
    syncQuests()
  }, [userId, isNative])

  // Re-sync on app-foreground (native sends 'refreshQuests' from its AppState
  // listener) so a just-completed quest updates the widget promptly.
  useNativeMessages(['refreshQuests'], () => {
    syncQuests()
  })
}
