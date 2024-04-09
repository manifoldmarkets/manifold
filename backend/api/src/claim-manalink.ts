import * as admin from 'firebase-admin'
import { z } from 'zod'
import { isVerified, User } from 'common/user'
import { canSendMana } from 'common/can-send-mana'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Row, tsToMillis } from 'common/supabase/utils'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'

const bodySchema = z.object({ slug: z.string() }).strict()

// don't tell the users but you can double redeem via race conditions.
// the money still gets taken from the creator correctly though so no money is created

export const claimmanalink = authEndpoint(async (req, auth) => {
  const { slug } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    // Look up the manalink
    const manalink = await pg.oneOrNone<Row<'manalinks'>>(
      `select * from manalinks where id = $1`,
      [slug]
    )

    if (!manalink) {
      throw new APIError(404, 'Manalink not found')
    }

    const { amount, creator_id, expires_time, max_uses } = manalink

    const claimedUserIds = await pg.map(
      `select txns.data from manalink_claims
         join txns on txns.id = manalink_claims.txn_id
         where manalink_id = $1`,
      [slug],
      (r) => r.data.toId as string
    )

    if (auth.uid === creator_id)
      throw new APIError(403, `You can't claim your own manalink`)

    const fromDoc = firestore.doc(`users/${creator_id}`)
    const fromSnap = await transaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(500, `User ${creator_id} not found`)
    }
    const fromUser = fromSnap.data() as User

    const { canSend, message } = await canSendMana(fromUser, () =>
      getUserPortfolioInternal(fromUser.id)
    )
    if (!canSend) {
      throw new APIError(403, message)
    }

    // Only permit one redemption per user per link
    if (claimedUserIds.includes(auth.uid)) {
      throw new APIError(403, `You already redeemed manalink ${slug}`)
    }

    // Disallow expired or maxed out links
    if (expires_time != null && tsToMillis(expires_time) < Date.now()) {
      throw new APIError(
        403,
        `Manalink ${slug} expired on ${new Date(expires_time).toLocaleString()}`
      )
    }
    if (max_uses != null && max_uses <= claimedUserIds.length) {
      throw new APIError(
        403,
        `Manalink ${slug} has reached its max uses of ${max_uses}`
      )
    }

    if (fromUser.balance < amount) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.name} needed ${amount} for this manalink but only had ${fromUser.balance} `
      )
    }

    const toDoc = firestore.doc(`users/${auth.uid}`)
    const toSnap = await transaction.get(toDoc)
    if (!toSnap.exists) {
      throw new APIError(500, `User ${auth.uid} not found`)
    }
    const toUser = toSnap.data() as User

    const canReceive = isVerified(toUser)
    if (!canReceive) {
      throw new APIError(
        403,
        'You must verify your phone number to claim mana.'
      )
    }

    // Actually execute the txn
    const data = {
      fromId: creator_id,
      fromType: 'USER',
      toId: auth.uid,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'MANALINK',
      description: `Manalink ${slug} claimed: ${amount} from ${toUser.username} to ${auth.uid}`,
    } as const

    const result = await runTxn(transaction, data)
    const txnId = result.txn?.id
    if (!txnId) {
      throw new APIError(
        500,
        result.message ?? 'An error occurred posting the transaction.'
      )
    }

    await pg.none(
      `insert into manalink_claims (txn_id, manalink_id) values ($1, $2)`,
      [txnId, slug]
    )

    return { message: 'Manalink claimed' }
  })
})

const firestore = admin.firestore()
