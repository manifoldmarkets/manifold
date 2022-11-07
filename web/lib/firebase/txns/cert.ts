import { CertTxn, Txn } from 'common/txn'
import { orderBy, query, where, doc } from 'firebase/firestore'
import { coll, listenForValues } from '../utils'

export const txns = coll<Txn>('txns')

const getCertTxnsQuery = (certId: string) =>
  query(txns, where('certId', '==', certId), orderBy('createdTime', 'desc'))

export function listenForCertTxns(
  certId: string,
  setTxns: (txns: CertTxn[]) => void
) {
  return listenForValues<CertTxn>(getCertTxnsQuery(certId), setTxns)
}
