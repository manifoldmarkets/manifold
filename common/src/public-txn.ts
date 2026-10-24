import { pick } from 'lodash'
import { type AnyTxnCategory, type Txn } from './txn'

// Txns go out unauthenticated (/v0/txns, /v0/managrams, get-balance-changes),
// so anything that works as a secret or names an external payment comes off
// first.

// Older MANALINK descriptions embed the link's slug, which is a bearer secret.
export const PUBLIC_MANALINK_DESCRIPTION = 'Manalink claimed'

// Payment categories keep the rail and the amount (web reads paidInCents for the
// 24h purchase limit) and drop provider ids: Stripe/Apple/GIDX transaction and
// session ids, Daimo payment ids and tx hashes, offer ids.
const PAYMENT_CATEGORIES: ReadonlySet<AnyTxnCategory> = new Set<AnyTxnCategory>(
  ['MANA_PURCHASE', 'CASH_BONUS', 'CASH_OUT']
)
const PUBLIC_PAYMENT_DATA_KEYS = ['type', 'paidInCents', 'payoutInDollars']

export const toPublicTxn = (txn: Txn): Txn => {
  if (txn.category === 'MANALINK') {
    return { ...txn, description: PUBLIC_MANALINK_DESCRIPTION }
  }
  if (PAYMENT_CATEGORIES.has(txn.category) && txn.data) {
    // The per-category data types mark provider ids required; the public shape
    // deliberately omits them.
    return { ...txn, data: pick(txn.data, PUBLIC_PAYMENT_DATA_KEYS) } as Txn
  }
  return txn
}
