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
