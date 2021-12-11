import * as admin from 'firebase-admin'

import { Contract } from './types/contract'
import { User } from './types/user'

export const getValue = async <T>(collection: string, doc: string) => {
  const snap = await admin.firestore()
    .collection(collection)
    .doc(doc)
    .get()

  return snap.exists
    ? snap.data() as T
    : undefined
}

export const getContract = (contractId: string) => {
  return getValue<Contract>('contracts', contractId)
}

export const getUser = (userId: string) => {
  return getValue<User>('users', userId)
}