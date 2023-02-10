import {
  CertDividendTxn,
  CertMintTxn,
  CertPayManaTxn,
  CertTransferTxn,
} from 'common/txn'
import { formatMoney } from 'common/util/format'
import * as admin from 'firebase-admin'

const firestore = admin.firestore()

// Note: this does NOT validate that the user has enough mana
export async function mintAndPoolCert(
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
    description: `USER/${userId} minted ${mintShares} shares`,
  }
  batch.set(ref1, certMintTxn)

  // Currently assumes that the pool is set up with equal shares and M$
  const poolMana = poolShares
  // Then, create two txns for setting up the pool at t=time+1
  const ref2 = firestore.collection('txns').doc()
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
    description: `USER/${userId} added ${poolShares} shares to pool`,
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
    description: `USER/${userId} added ${formatMoney(poolMana)} to pool`,
  }
  batch.set(ref3, certPayManaTxn)

  return await batch.commit()
}

// In a batch, add two txns for transferring a cert in exchange for mana
// TODO: Should we generate a "betId" representing this transaction?
export function buyFromPool(
  userId: string,
  certId: string,
  // Positive if we're removing shares from pool; negative if adding
  shares: number,
  mana: number,
  transaction: admin.firestore.Transaction
) {
  const time = Date.now()

  // First, create one txn for transferring the shares
  const ref1 = firestore.collection('txns').doc()
  const certTransferTxn: CertTransferTxn = {
    category: 'CERT_TRANSFER',
    id: ref1.id,
    certId,
    createdTime: time,
    fromId: certId,
    fromType: 'CONTRACT',
    toId: userId,
    toType: 'USER',
    token: 'SHARE',
    amount: shares,
    description: `USER/${userId} bought ${shares} shares from pool`,
  }
  transaction.set(ref1, certTransferTxn)

  // Then, create one txn for transferring the mana
  const ref2 = firestore.collection('txns').doc()
  const certPayManaTxn: CertPayManaTxn = {
    category: 'CERT_PAY_MANA',
    id: ref2.id,
    certId,
    createdTime: time,
    fromId: userId,
    fromType: 'USER',
    toId: certId,
    toType: 'CONTRACT',
    token: 'M$',
    amount: mana,
    description: `USER/${userId} paid ${formatMoney(mana)} to pool`,
  }
  transaction.set(ref2, certPayManaTxn)
}

export function dividendTxns(
  transaction: admin.firestore.Transaction,
  providerId: string,
  certId: string,
  payouts: {
    userId: string
    payout: number
  }[]
) {
  // Create one CertDividend for each recipient
  payouts.forEach(({ userId, payout }) => {
    const ref = firestore.collection('txns').doc()
    const certDividendTxn: CertDividendTxn = {
      category: 'CERT_DIVIDEND',
      id: ref.id,
      certId: certId,
      createdTime: Date.now(),
      fromId: providerId,
      fromType: 'USER',
      toId: userId,
      toType: 'USER',
      token: 'M$',
      amount: payout,
      description: `USER/${providerId} paid ${formatMoney(
        payout
      )} dividend to USER/${userId}`,
    }
    transaction.set(ref, certDividendTxn)
  })
}

/*
txns for minting:
{
  fromId: 'BANK'
  toId: 'user/alice'
  amount: 10_000
  token: 'SHARE'
  description: 'user/alice mints 10_000 shares'
}

txns for initializing pool:
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'SHARE'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}

txns for buying:
{
  fromId: 'user/bob'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/bob pays 500 M$ for 250 shares'
}
{
  fromId: 'contract/cert1234'
  toId: 'user/bob'
  amount: 250
  token: 'SHARE'
  description: 'user/bob pays 500 M$ for 250 shares'
}

txns for gifting:
{
  fromId: 'user/bob'
  toId: 'user/charlie'
  amount: 100
  token: 'SHARE'
  description: 'user/bob gifts 100 shares to user/charlie'
}

txns for sending dividends:
{
  fromId: 'user/alice'
  toId: 'user/bob',
  amount: 250
  token: 'M$'
  description: 'user/alice distributes 250 M$ to user/bob'
}

txns for resolving/burning:
{
  fromId: 'user/alice'
  toId: 'BANK'
  amount: 250
  token: 'SHARE'
  description: 'user/alice burns 250 shares'
}
*/
