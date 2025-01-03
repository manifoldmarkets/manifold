import { type Answer } from 'common/answer'
import { useAPIGetter } from './use-api-getter'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { prepopulateCache } from 'client-common/hooks/use-api-getter'

export function useAnswer(answerId: string | undefined) {
  const { data: answer, setData: setAnswer } = useAPIGetter(
    'answer/:answerId',
    answerId ? { answerId } : undefined
  )

  return { answer: answerId ? answer : undefined, setAnswer }
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

export function precacheAnswers(answers: Answer[]) {
  for (const answer of answers) {
    if (answer.id)
      prepopulateCache('answer/:answerId', { answerId: answer.id }, answer)
  }
}
