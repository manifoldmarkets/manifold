import { collection, doc, setDoc } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { binaryOutcomes } from 'web/components/bet/bet-panel'

function getOrdersCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'orders')
}

export const createOrder = async (
  contractId: string,
  userId: string,
  outcome: binaryOutcomes,
  amount: number,
  probBefore: number
) => {
  const ref = doc(getOrdersCollection(contractId))
  const order = {
    id: ref.id,
    userId,
    contractId,
    createdTime: Date.now(),
    amount,
    outcome,
    probBefore,
    isFilled: false,
    isCancelled: false,
  }
  await setDoc(ref, order)
  return order
}
