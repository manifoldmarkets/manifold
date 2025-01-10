import { SetStateAction } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'

export const useContractUpdates = <C extends Contract | Pick<Contract, 'id'>>(
  initial: C,
  setContract: (value: SetStateAction<C>) => void
) => {
  useApiSubscription({
    topics: [`contract/${initial.id}/new-answer`],
    enabled: 'mechanism' in initial && initial.mechanism === 'cpmm-multi-1',
    onBroadcast: ({ data }) => {
      setContract((contract) => {
        return {
          ...contract,
          answers: [
            ...('answers' in contract ? contract.answers : []),
            data.answer as Answer,
          ],
        }
      })
    },
  })

  useApiSubscription({
    topics: [`contract/${initial.id}/updated-answers`],
    enabled: 'mechanism' in initial && initial.mechanism === 'cpmm-multi-1',
    onBroadcast: ({ data }) => {
      const newAnswerUpdates = data.answers as (Partial<Answer> & {
        id: string
      })[]
      setContract((contract) => {
        return {
          ...contract,
          answers: ('answers' in contract ? contract.answers : []).map(
            (answer) => {
              const update = newAnswerUpdates.find(
                (newAnswer) => newAnswer.id === answer.id
              )
              if (!update) return answer
              return { ...answer, ...update }
            }
          ),
        }
      })
    },
  })

  useApiSubscription({
    topics: [`contract/${initial.id}`],
    onBroadcast: ({ data }) => {
      setContract((contract) => {
        return { ...contract, ...(data.contract as C) }
      })
    },
  })
}
