import { collection, doc, query, setDoc, where } from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { binaryOutcomes } from 'web/components/bet/bet-panel'
import { listenForValues } from 'web/lib/firebase/utils'
import { Order } from 'common/order'
import { useEffect, useState } from 'react'

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

export const useOrders = (userId: string | undefined, contractId: string) => {
  const [orders, setOrders] = useState<Order[]>([])
  useEffect(() => {
    if (!userId) return
    const unsubscribe = listenForOrders(userId, contractId, (orders) => {
      console.log('orders', orders)
      setOrders(orders)
    })
    return () => unsubscribe()
  }, [userId, contractId])
  return orders
}

function listenForOrders(
  userId: string,
  contractId: string,
  setOrders: (orders: Order[]) => void
) {
  const orders = query(
    collection(db, `contracts/${contractId}/orders`),
    where('userId', '==', userId),
    where('isFilled', '==', false),
    where('isCancelled', '==', false)
  )
  return listenForValues<Order>(orders, (docs) => setOrders(docs))
}
