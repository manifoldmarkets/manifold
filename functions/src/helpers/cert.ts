import { CertMintTxn, CertPayManaTxn, CertTransferTxn } from 'common/txn'
import { formatMoney } from 'common/util/format'
import * as admin from 'firebase-admin'

const firestore = admin.firestore()

export async function certMintAndPool(
  userId: string,
  certId: string,
  mintShares: number,
  poolShares: number
) {
  const batch = firestore.batch()
  const time = Date.now()

  // First, create one txn for minting the shares
  const ref1 = firestore.collection('txns').doc()
  const certMintTxn: CertMintTxn = {
    category: 'CERT_MINT',
    id: ref1.id,
    certId,
    createdTime: time,
    fromId: 'BANK',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    token: 'SHARE',
    amount: mintShares,
    description: `user/${userId} minted ${mintShares} shares`,
  }
  batch.set(ref1, certMintTxn)

  // Currently assumes poolShares = #mint shares
  const poolMana = poolShares
  // Then, create two txns for setting up the pool at t=time+1
  const ref2 = firestore.collection('txns').doc()
  const description = `user/${userId} adds ${poolShares} shares & ${formatMoney(
    poolMana
  )} to pool`
  const certTransferTxn: CertTransferTxn = {
    category: 'CERT_TRANSFER',
    id: ref2.id,
    certId,
    createdTime: time + 1,
    fromId: userId,
    fromType: 'USER',
    toId: certId,
    toType: 'CONTRACT',
    token: 'SHARE',
    amount: poolShares,
    description,
  }
  batch.set(ref2, certTransferTxn)

  const ref3 = firestore.collection('txns').doc()
  const certPayManaTxn: CertPayManaTxn = {
    category: 'CERT_PAY_MANA',
    id: ref3.id,
    certId,
    createdTime: time + 1,
    fromId: userId,
    fromType: 'USER',
    toId: certId,
    toType: 'CONTRACT',
    token: 'M$',
    amount: poolMana,
    description,
  }
  batch.set(ref3, certPayManaTxn)

  return await batch.commit()
}
