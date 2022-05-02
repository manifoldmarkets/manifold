import { collection, query, where, orderBy } from 'firebase/firestore'
import _ from 'lodash'
import { Txn } from '../../../common/txn'

import { db } from './init'
import { listenForValues } from './utils'

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

const getCharitiesQuery = () =>
  query(txnCollection, where('toType', '==', 'CHARITY'))

export function listenForAllCharityTxns(setTxns: (txns: Txn[]) => void) {
  return listenForValues<Txn>(getCharitiesQuery(), setTxns)
}
