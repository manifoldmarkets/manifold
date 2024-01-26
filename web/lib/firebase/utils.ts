import {
  collection,
  getDoc,
  getDocs,
  onSnapshot,
  Query,
  CollectionReference,
  DocumentReference,
} from 'firebase/firestore'
import { db } from './init'

export const coll = <T>(path: string, ...rest: string[]) => {
  return collection(db, path, ...rest) as CollectionReference<T>
}

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
  return onSnapshot(
    query,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return

      const values = snapshot.docs.map((doc) => doc.data() as T)
      setValues(values)
    },
    console.error
  )
}
