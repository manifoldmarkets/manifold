import { User } from './user'
import { last } from 'lodash'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { DAY_MS } from 'common/util/time'
import { SupabaseClient } from 'common/supabase/utils'
import { formatMoney } from 'common/util/format'

export type Manalink = {
  // The link to send: https://manifold.markets/send/{slug}
  // Also functions as the unique id for the link.
  slug: string

  // Note: we assume both fromId and toId are of SourceType 'USER'
  fromId: string

  // Displayed to people claiming the link
  message: string

  // How much to send with the link
  amount: number
  token: 'M$'

  createdTime: number
  // If null, the link is valid forever
  expiresTime: number | null
  // If null, the link can be used infinitely
  maxUses: number | null

  // Used for simpler caching
  claimedUserIds: string[]
  // Successful redemptions of the link
  claims: Claim[]
}

export type Claim = {
  toId: string

  // The ID of the successful txn that tracks the money moved
  txnId: string

  claimedTime: number
}

export async function canSendMana(user: User, db: SupabaseClient) {
  const ageThreshold = Date.now() - 14 * DAY_MS
  const portfolioHistory = last(
    await getPortfolioHistory(user.id, Date.now() - DAY_MS, db)
  )

  return (
    // Exception for new Manifest ticket purchasers
    (user.balance > 20000 && Date.now() < new Date(1695625200000).valueOf()) ||
    (user.createdTime < ageThreshold &&
      (user.balance > 1000 ||
        user.profitCached.allTime > 500 ||
        (portfolioHistory?.investmentValue ?? 0) > 1000 ||
        user.creatorTraders.allTime > 10))
  )
}

export const SEND_MANA_REQ = `Your account must be older than 2 weeks and have a balance or net worth greater than ${formatMoney(
  1000
)} or total profits greater than ${formatMoney(500)} to send mana.`
