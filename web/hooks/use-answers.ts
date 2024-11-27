import { useEffect, useState } from 'react'
import { type Answer } from 'common/answer'
import { useApiSubscription } from './use-api-subscription'
import { api } from 'web/lib/api/api'

// TODO: use API getter

export function useAnswer(answerId: string | undefined) {
  const [answer, setAnswer] = useState<Answer>()
  useEffect(() => {
    if (answerId) {
      api('answer/:answerId', {
        answerId,
      }).then(setAnswer)
    }
  }, [answerId])

  return { answer, setAnswer }
}

export function useLiveAnswer(answerId: string | undefined) {
  const { answer, setAnswer } = useAnswer(answerId)

  useApiSubscription({
    enabled: answerId != undefined,
    topics: [`answer/${answerId}/update`],
    onBroadcast: ({ data }) => {
      setAnswer((a) =>
        a ? { ...a, ...(data.answer as Answer) } : (data.answer as Answer)
      )
    },
  })

  return answer
}

// export function useAnswers(contractId: string | undefined) {

export function useLiveAnswers(contractId: string | undefined) {
  const [answers, setAnswers] = useState<Answer[]>([])

  useEffect(() => {
    if (contractId) {
      // TODO: create api
      api('market/:contractId/answers', {
        contractId,
      }).then(setAnswers)
    }
  }, [contractId])

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
