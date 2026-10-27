import { SetStateAction } from 'react'
import { useApiSubscription } from './use-api-subscription'
import { Contract, isMultiCpmmMechanism } from 'common/contract'
import { Answer } from 'common/answer'
import { uniqBy } from 'lodash'
import { unauthedApi } from 'common/util/api'
export const useContractUpdates = <C extends Contract | Pick<Contract, 'id'>>(
  initial: C,
  setContract: (value: SetStateAction<C>) => void
) => {
  useApiSubscription({
    topics: [
      `contract/${initial.id}`,
      `contract/${initial.id}/new-answer`,
      `contract/${initial.id}/updated-answers`,
    ],
    getSnapshot: async (signal) => {
      const [contract] = await unauthedApi(
        'markets-by-ids',
        { ids: [initial.id] },
        { cache: 'no-store', signal }
      )
      if (!contract) throw new Error('Market unavailable during recovery.')
      // This is the canonical object, not a partial broadcast. Replacing it
      // also clears optional fields deleted during the outage.
      return () => setContract(contract as C)
    },
    onBroadcast: ({ topic, data }) => {
      if (topic === `contract/${initial.id}`) {
        setContract((contract) => ({ ...contract, ...(data.contract as C) }))
        return
      }
      if (!('mechanism' in initial) || !isMultiCpmmMechanism(initial.mechanism))
        return
      if (topic.endsWith('/new-answer')) {
        setContract((contract) => {
          return {
            ...contract,
            answers: uniqBy(
              [
                ...('answers' in contract ? contract.answers : []),
                data.answer as Answer,
              ],
              'id'
            ),
          }
        })
        return
      }
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
              return {
                ...answer,
                ...update,
                ...('resolution' in update
                  ? { resolution: update.resolution ?? undefined }
                  : {}),
                ...('resolutionTime' in update
                  ? { resolutionTime: update.resolutionTime ?? undefined }
                  : {}),
                ...('resolutionProbability' in update
                  ? {
                      resolutionProbability:
                        update.resolutionProbability ?? undefined,
                    }
                  : {}),
                ...('resolverId' in update
                  ? { resolverId: update.resolverId ?? undefined }
                  : {}),
              }
            }
          ),
        }
      })
    },
  })
}
