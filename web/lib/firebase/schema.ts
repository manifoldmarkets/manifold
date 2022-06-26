import { db } from './init'
import { collection, CollectionReference } from 'firebase/firestore'

import { Contract } from 'common/contract'
import { User, PrivateUser } from 'common/user'
import { Txn } from 'common/txn'
import { Group } from 'common/group'
import { Manalink } from 'common/manalink'

const coll = <T>(path: string, ...rest: string[]) => {
  return collection(db, path, ...rest) as CollectionReference<T>
}

export const groups = coll<Group>('groups')
export const manalinks = coll<Manalink>('manalinks')
export const privateUsers = coll<PrivateUser>('private-users')
export const txns = coll<Txn>('txns')
export const contracts = coll<Contract>('contracts')
export const users = coll<User>('users')
