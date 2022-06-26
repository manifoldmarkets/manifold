import { ManalinkTxn, DonationTxn, TipTxn } from 'common/txn'
import { orderBy, query, where } from 'firebase/firestore'
import { txns } from './schema'
import { getValues, listenForValues } from './utils'
import { useState, useEffect } from 'react'
import { orderBy as _orderBy } from 'lodash'

const getCharityQuery = (charityId: string) =>
  query(
    txns,
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

const charitiesQuery = query(txns, where('toType', '==', 'CHARITY'))

export function getAllCharityTxns() {
  return getValues<DonationTxn>(charitiesQuery)
}

const getTipsQuery = (contractId: string) =>
  query(
    txns,
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
      txns,
      where('fromId', '==', userId),
      where('category', '==', 'MANALINK'),
      orderBy('createdTime', 'desc')
    )
    const toQuery = query(
      txns,
      where('toId', '==', userId),
      where('category', '==', 'MANALINK'),
      orderBy('createdTime', 'desc')
    )
    listenForValues(fromQuery, setFromTxns)
    listenForValues(toQuery, setToTxns)
  }, [userId])

  return _orderBy([...fromTxns, ...toTxns], ['createdTime'], ['desc'])
}
