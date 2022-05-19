import { collection, query, where, orderBy } from 'firebase/firestore'
import { Txn } from 'common/txn'

import { db } from './init'
import { getValues, listenForValues } from './utils'
import { useState, useEffect } from 'react'
import { sortBy } from 'lodash'

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

// Find all manalink Txns that are from or to this user
export function useManalinkTxns(userId: string) {
  // TODO: Need to instantiate these indexes too
  const fromQuery = query(
    txnCollection,
    where('fromId', '==', userId),
    where('category', '==', 'MANALINK'),
    orderBy('createdTime', 'desc')
  )
  const toQuery = query(
    txnCollection,
    where('toId', '==', userId),
    where('category', '==', 'MANALINK'),
    orderBy('createdTime', 'desc')
  )

  const [fromTxns, setFromTxns] = useState<Txn[]>([])
  const [toTxns, setToTxns] = useState<Txn[]>([])

  useEffect(() => {
    listenForValues(fromQuery, setFromTxns)
    listenForValues(toQuery, setToTxns)
  }, [userId])

  return sortBy([...fromTxns, ...toTxns], 'createdTime').reverse()
}
