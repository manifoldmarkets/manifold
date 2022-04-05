import { doc, collection, setDoc } from 'firebase/firestore'
import _ from 'lodash'

import { db } from './init'
import { View } from '../../../common/view'

export async function logView(userId: string, contractId: string) {
  const ref = doc(collection(db, 'private-users', userId, 'views'))

  const view: View = {
    contractId,
    timestamp: Date.now(),
  }

  return await setDoc(ref, view)
}
