import { removeUndefinedProps } from 'common/util/object'
import { doc, setDoc } from 'firebase/firestore'
import { coll } from './utils'

interface ActionLog {
  /** id of the market contract */
  id: string
  amount?: number
  outcome: 'YES' | 'NO' | 'SKIP'
  time: number
}
// TODO: normal view actions

export const logSwipe = async (
  props: Pick<ActionLog, 'amount' | 'outcome'> & {
    contractId: string
    userId: string
  }
) => {
  const { contractId, userId, amount, outcome } = props
  const time = Date.now()

  const document = doc(
    coll<ActionLog>(`/private-users/${userId}/seenMarkets`),
    contractId
  )

  const data: ActionLog = removeUndefinedProps({
    id: contractId,
    amount,
    outcome,
    time,
  })
  await setDoc(document, data)
  return data
}
