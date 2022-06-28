import {
  CollectionReference,
  doc,
  collection,
  getDoc,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { Stats } from 'common/stats'

const statsCollection = collection(db, 'stats') as CollectionReference<Stats>
const statsDoc = doc(statsCollection, 'stats')

export const getStats = async () => {
  return (await getDoc(statsDoc)).data()
}
