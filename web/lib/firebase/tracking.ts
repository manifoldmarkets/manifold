import { doc, collection, setDoc } from 'firebase/firestore'

import { db } from './init'
import { ClickEvent, LatencyEvent, View } from 'common/tracking'
import { listenForLogin, User } from './users'

let user: User | null = null
if (typeof window !== 'undefined') {
  listenForLogin((u) => (user = u))
}

export async function trackView(contractId: string) {
  if (!user) return
  const ref = doc(collection(db, 'private-users', user.id, 'views'))

  const view: View = {
    contractId,
    timestamp: Date.now(),
  }

  return await setDoc(ref, view)
}

export async function trackClick(contractId: string) {
  if (!user) return
  const ref = doc(collection(db, 'private-users', user.id, 'events'))

  const clickEvent: ClickEvent = {
    type: 'click',
    contractId,
    timestamp: Date.now(),
  }

  return await setDoc(ref, clickEvent)
}

export async function trackLatency(
  type: 'feed' | 'portfolio',
  latency: number
) {
  if (!user) return
  const ref = doc(collection(db, 'private-users', user.id, 'latency'))

  const latencyEvent: LatencyEvent = {
    type,
    latency,
    timestamp: Date.now(),
  }

  return await setDoc(ref, latencyEvent)
}
