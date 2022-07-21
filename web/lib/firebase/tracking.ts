import { doc, collection, setDoc } from 'firebase/firestore'

import { db } from './init'
import { ClickEvent, LatencyEvent, View } from 'common/tracking'

export async function trackView(userId: string, contractId: string) {
  const ref = doc(collection(db, 'private-users', userId, 'views'))

  const view: View = {
    contractId,
    timestamp: Date.now(),
  }

  return await setDoc(ref, view)
}

export async function trackClick(userId: string, contractId: string) {
  const ref = doc(collection(db, 'private-users', userId, 'events'))

  const clickEvent: ClickEvent = {
    type: 'click',
    contractId,
    timestamp: Date.now(),
  }

  return await setDoc(ref, clickEvent)
}

export async function trackLatency(
  userId: string,
  type: 'feed' | 'portfolio',
  latency: number
) {
  const ref = doc(collection(db, 'private-users', userId, 'latency'))

  const latencyEvent: LatencyEvent = {
    type,
    latency,
    timestamp: Date.now(),
  }

  return await setDoc(ref, latencyEvent)
}
