import { useState } from 'react'
import { type Answer } from 'common/answer'
import { useApiSubscription } from './use-api-subscription'

export function useLiveAnswers(contractId: string | undefined) {
  const [answers, setAnswers] = useState<Answer[]>([])

  useApiSubscription({
    enabled: contractId != undefined,
    topics: [
      `contract/${contractId}/new-answer`,
      `contract/${contractId}/updated-answers`,
    ],
    onBroadcast: ({ data, topic }) => {
      if (topic.endsWith('new-answer')) {
        setAnswers((a) => [...a, data.answer as Answer])
      } else if (topic.endsWith('updated-answers')) {
        const updates = data.answers as (Partial<Answer> & { id: string })[]
        setAnswers((a) =>
          a.map((a) => {
            const u = updates.find((u) => u.id === a.id)
            if (!u) return a
            return { ...a, ...u }
          })
        )
      }
    },
  })

  return answers
}
