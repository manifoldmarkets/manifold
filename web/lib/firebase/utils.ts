import { db } from './init'
import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  Query,
  DocumentReference,
} from 'firebase/firestore'

export const getValue = async <T>(collectionName: string, docName: string) => {
  const snap = await getDoc(doc(db, collectionName, docName))
  return snap.exists() ? (snap.data() as T) : null
}

export const getValues = async <T>(query: Query) => {
  const snap = await getDocs(query)
  return snap.docs.map((doc) => doc.data() as T)
}

export function listenForValue<T>(
  docRef: DocumentReference,
  setValue: (value: T | null) => void
) {
  return onSnapshot(docRef, (snapshot) => {
    const value = snapshot.exists() ? (snapshot.data() as T) : null
    setValue(value)
  })
}

export function listenForValues<T>(
  query: Query,
  setValues: (values: T[]) => void
) {
  return onSnapshot(query, (snapshot) => {
    if (snapshot.metadata.fromCache) return

    const values = snapshot.docs.map((doc) => doc.data() as T)
    setValues(values)
  })
}
