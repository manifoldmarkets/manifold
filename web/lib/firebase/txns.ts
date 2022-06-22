import { ManalinkTxn, DonationTxn, TipTxn } from 'common/txn'
import { collection, orderBy, query, where } from 'firebase/firestore'
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
  setTxns: (txns: DonationTxn[]) => void
) {
  return listenForValues<DonationTxn>(getCharityQuery(charityId), setTxns)
}

const charitiesQuery = query(txnCollection, where('toType', '==', 'CHARITY'))

export function getAllCharityTxns() {
  return getValues<DonationTxn>(charitiesQuery)
}

const getTipsQuery = (contractId: string) =>
  query(
    txnCollection,
    where('category', '==', 'TIP'),
    where('data.contractId', '==', contractId)
  )

export function listenForTipTxns(
  contractId: string,
  setTxns: (txns: TipTxn[]) => void
) {
  return listenForValues<TipTxn>(getTipsQuery(contractId), setTxns)
}

// Find all manalink Txns that are from or to this user
export function useManalinkTxns(userId: string) {
  const [fromTxns, setFromTxns] = useState<ManalinkTxn[]>([])
  const [toTxns, setToTxns] = useState<ManalinkTxn[]>([])

  useEffect(() => {
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
    listenForValues(fromQuery, setFromTxns)
    listenForValues(toQuery, setToTxns)
  }, [userId])

  return sortBy([...fromTxns, ...toTxns], 'createdTime').reverse()
}
