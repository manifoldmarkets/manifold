import { ManalinkTxn, DonationTxn, TipTxn, Txn, LeagueBidTxn } from 'common/txn'
import { orderBy, query, where } from 'firebase/firestore'
import { coll, getValues, listenForValues } from './utils'
import { useState, useEffect } from 'react'
import { orderBy as _orderBy } from 'lodash'

export const txns = coll<Txn>('txns')

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

const getTipsOnContractQuery = (contractId: string) =>
  query(
    txns,
    where('category', '==', 'TIP'),
    where('data.contractId', '==', contractId)
  )

const getTipsOnGroupQuery = (groupId: string) =>
  query(
    txns,
    where('category', '==', 'TIP'),
    where('data.groupId', '==', groupId)
  )

const getTipsOnPostQuery = (postId: string) =>
  query(
    txns,
    where('category', '==', 'TIP'),
    where('data.postId', '==', postId)
  )

export function listenForTipTxns(
  contractId: string,
  setTxns: (txns: TipTxn[]) => void
) {
  return listenForValues<TipTxn>(getTipsOnContractQuery(contractId), setTxns)
}
export function listenForTipTxnsOnGroup(
  groupId: string,
  setTxns: (txns: TipTxn[]) => void
) {
  return listenForValues<TipTxn>(getTipsOnGroupQuery(groupId), setTxns)
}

export function listenForTipTxnsOnPost(
  postId: string,
  setTxns: (txns: TipTxn[]) => void
) {
  return listenForValues<TipTxn>(getTipsOnPostQuery(postId), setTxns)
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

const getLeagueBidsTxnQuery = (
  season: number,
  division: number,
  cohort: string
) =>
  query(
    txns,
    where('category', '==', 'LEAGUE_BID'),
    where('toId', '==', `${season}-${division}-${cohort}`),
    orderBy('createdTime', 'desc')
  )

export function listenForLeagueBidTxn(
  season: number,
  division: number,
  cohort: string,
  setTxns: (txns: LeagueBidTxn[]) => void
) {
  return listenForValues<LeagueBidTxn>(
    getLeagueBidsTxnQuery(season, division, cohort),
    setTxns
  )
}
