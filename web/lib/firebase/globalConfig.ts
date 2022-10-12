import {
  CollectionReference,
  doc,
  collection,
  getDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from 'web/lib/firebase/init'
import { GlobalConfig } from 'common/globalConfig'
import { listenForValue } from './utils'

const globalConfigCollection = collection(
  db,
  'globalConfig'
) as CollectionReference<GlobalConfig>
const globalConfigDoc = doc(globalConfigCollection, 'globalConfig')

export const getGlobalConfig = async () => {
  return (await getDoc(globalConfigDoc)).data()
}

export function updateGlobalConfig(
  globalConfig: GlobalConfig,
  updates: Partial<GlobalConfig>
) {
  return updateDoc(globalConfigDoc, updates)
}

export function listenForGlobalConfig(
  setGlobalConfig: (globalConfig: GlobalConfig | null) => void
) {
  return listenForValue(globalConfigDoc, setGlobalConfig)
}
