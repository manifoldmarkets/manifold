import { CertTxn } from 'common/txn'
import { sortBy, sum } from 'lodash'

// e.g. { 'user/jasldfjdkl': 900, 'contract/afsdjkla': 100 }
export function getCertOwnership(txns: CertTxn[]) {
  const ownership: { [id: string]: number } = {}
  const sortedTxns = sortBy(txns, 'createdTime')
  for (const txn of sortedTxns) {
    const fromId = `${txn.fromType}/${txn.fromId}`
    const toId = `${txn.toType}/${txn.toId}`
    if (txn.category === 'CERT_MINT') {
      ownership[toId] = txn.amount
    } else if (txn.category === 'CERT_TRANSFER') {
      ownership[fromId] -= txn.amount
      ownership[toId] = (ownership[toId] || 0) + txn.amount
    }
  }
  return ownership
}

// Like the above, but with userIds only.
// We mapping any CONTRACT types to 'USER/{creatorId}'
export function getCertOwnershipUsers(creatorId: string, txns: CertTxn[]) {
  const ownership = getCertOwnership(txns)
  const users: { [userId: string]: number } = {}
  for (const ownerId in ownership) {
    const [type, id] = ownerId.split('/')
    switch (type) {
      case 'USER':
        users[id] = (users[id] || 0) + ownership[ownerId]
        break
      case 'CONTRACT':
        users[creatorId] = (users[creatorId] || 0) + ownership[ownerId]
    }
  }
  return users
}

// Map each user to amount to pay
// E.g. { 'alice': -100, 'bob': 25, 'carol': 75 }
export function getDividendPayouts(
  providerId: string,
  totalDividend: number,
  txns: CertTxn[]
) {
  // 1) Calculate the total shares
  // 2) Divide to get the M$ amount to distribute per share
  // 3) Pay out that much M$ to each holder (assume that all pool shares belong to cert creator)
  const ownership = getCertOwnershipUsers(providerId, txns)
  const totalShares = sum(Object.values(ownership))
  const dividendPerShare = totalDividend / totalShares
  const payouts = Object.entries(ownership).map(([ownerId, shares]) => ({
    userId: ownerId,
    payout:
      shares * dividendPerShare -
      // Set a negative total payout for the provider
      (ownerId === providerId ? totalDividend : 0),
  }))
  return payouts
}
