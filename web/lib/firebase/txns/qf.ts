import { QFTxn, Txn } from 'common/txn'
import { orderBy, query, where } from 'firebase/firestore'
import { coll, listenForValues } from '../utils'

export const txns = coll<Txn>('txns')

const getQfTxnsQuery = (qfId: string) =>
  query(txns, where('qfId', '==', qfId), orderBy('createdTime', 'desc'))

export function listenForQfTxns(
  qfId: string,
  setTxns: (txns: QFTxn[]) => void
) {
  return listenForValues<QFTxn>(getQfTxnsQuery(qfId), setTxns)
}
