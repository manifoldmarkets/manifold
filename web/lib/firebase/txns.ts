import { DonationTxn, TipTxn } from 'common/txn'
import { collection, orderBy, query, where } from 'firebase/firestore'
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
