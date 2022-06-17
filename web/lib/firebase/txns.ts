import { collection, query, where, orderBy } from 'firebase/firestore'
import { Txn } from 'common/txn'

import { db } from './init'
import { getValues, listenForValues } from './utils'

const txnCollection = collection(db, 'txns')

const getCharityQuery = (charityId: string) =>
  query(
    txnCollection,
    where('toType', '==', 'CHARITY'),
    where('toId', '==', charityId),
    orderBy('createdTime', 'desc')
  )

export function listenForCharityTxns(
  charityId: string,
  setTxns: (txns: Txn[]) => void
) {
  return listenForValues<Txn>(getCharityQuery(charityId), setTxns)
}

const charitiesQuery = query(txnCollection, where('toType', '==', 'CHARITY'))

export function getAllCharityTxns() {
  return getValues<Txn>(charitiesQuery)
}
