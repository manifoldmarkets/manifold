import { db } from './init'
import {
  getDoc,
  getDocs,
  onSnapshot,
  Query,
  DocumentReference,
} from 'firebase/firestore'

export const getValue = async <T>(doc: DocumentReference) => {
  const snap = await getDoc(doc)
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
  // Exclude cached snapshots so we only trigger on fresh data.
  // includeMetadataChanges ensures listener is called even when server data is the same as cached data.
  return onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return

    const value = snapshot.exists() ? (snapshot.data() as T) : null
    setValue(value)
  })
}

export function listenForValues<T>(
  query: Query,
  setValues: (values: T[]) => void
) {
  // Exclude cached snapshots so we only trigger on fresh data.
  // includeMetadataChanges ensures listener is called even when server data is the same as cached data.
  return onSnapshot(query, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return

    const values = snapshot.docs.map((doc) => doc.data() as T)
    setValues(values)
  })
}
