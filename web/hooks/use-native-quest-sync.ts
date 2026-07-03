import { useEffect } from 'react'
import { QUEST_DETAILS, QuestType } from 'common/quest'
import { NativeQuestItem } from 'common/native-message'
import { getQuestScores } from 'common/supabase/set-scores'
import { getEffectiveTier } from 'common/user'
import { getEffectiveBonusMultiplier } from 'common/supporter-config'
import { db } from 'web/lib/supabase/db'
import { nativeSetQuests } from 'web/lib/native/native-messages'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useUser } from 'web/hooks/use-user'
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
  const user = useUser()
  // Supporter tiers earn multiplied quest rewards — mirror the quests modal so
  // the widget shows what the user will actually receive (e.g. PRO = 2x).
  const questMultiplier = user
    ? getEffectiveBonusMultiplier(getEffectiveTier(user), 'quest')
    : 1

  const syncQuests = useEvent(async () => {
    if (!isNative || !userId) return
    const scoreIds = WIDGET_QUESTS.map((q) => QUEST_DETAILS[q.type].scoreId)
    try {
      const scores = await getQuestScores(userId, scoreIds, db)
      const quests: NativeQuestItem[] = WIDGET_QUESTS.map((q) => {
        const { scoreId, requiredCount, rewardAmount } = QUEST_DETAILS[q.type]
        return {
          title: q.title,
          rewardMana: Math.floor(rewardAmount * questMultiplier),
          done: (scores[scoreId]?.score ?? 0) >= requiredCount,
          period: q.period,
        }
      })
      nativeSetQuests({ quests, updatedAt: Date.now() })
    } catch (e) {
      console.error('Error syncing quests to widget', e)
    }
  })

  // Initial sync once the user / native status is known; re-push if the
  // multiplier changes (the full user can load after the first sync).
  useEffect(() => {
    syncQuests()
  }, [userId, isNative, questMultiplier])

  // Re-sync on app-foreground (native sends 'refreshQuests' from its AppState
  // listener) so a just-completed quest updates the widget promptly.
  useNativeMessages(['refreshQuests'], () => {
    syncQuests()
  })
}
