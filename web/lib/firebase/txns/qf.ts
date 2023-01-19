import { QfTxn, Txn } from 'common/txn'
import { orderBy, query, where } from 'firebase/firestore'
import { coll, listenForValues } from '../utils'

export const txns = coll<Txn>('txns')

const getQfTxnsQuery = (qfId: string) =>
  query(txns, where('qfId', '==', qfId), orderBy('createdTime', 'desc'))

export function listenForQfTxns(
  qfId: string,
  setTxns: (txns: QfTxn[]) => void
) {
  return listenForValues<QfTxn>(getQfTxnsQuery(qfId), setTxns)
}
