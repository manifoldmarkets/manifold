import { useEffect, useState } from 'react'
import { getQuestCompletionStatus } from 'web/components/quests-or-streak'
import { User } from 'common/user'

export const useQuestStatus = (user: User | undefined | null) => {
  const [questStatus, setQuestStatus] = useState<
    Awaited<ReturnType<typeof getQuestCompletionStatus>> | undefined
  >(undefined)
  useEffect(() => {
    if (user) {
      getQuestCompletionStatus(user).then(setQuestStatus)
    }
  }, [user?.id])
  return questStatus
}
