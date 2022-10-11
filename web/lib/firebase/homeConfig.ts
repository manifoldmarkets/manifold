import {
  CollectionReference,
  doc,
  collection,
  getDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { HomeConfig } from 'common/homeConfig'

const homeConfigCollection = collection(
  db,
  'homeConfig'
) as CollectionReference<HomeConfig>
const homeConfigDoc = doc(homeConfigCollection, 'homeConfig')

export const getHomeConfig = async () => {
  return (await getDoc(homeConfigDoc)).data()
}

export function updateHomeConfig(
  homeConfig: HomeConfig,
  updates: Partial<HomeConfig>
) {
  return updateDoc(homeConfigDoc, updates)
}
