import * as admin from 'firebase-admin'
import { z } from 'zod'
import { User } from 'common/user'
import { canSendMana } from 'common/manalink'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { Row, tsToMillis } from 'common/supabase/utils'

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
    const db = createSupabaseClient()

    const canCreate = await canSendMana(fromUser, db)
    if (!canCreate) {
      throw new APIError(
        403,
        `You don't have at least 1000 mana or your account isn't 1 week old`
      )
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

    // Actually execute the txn
    const data = {
      fromId: creator_id,
      fromType: 'USER',
      toId: auth.uid,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'MANALINK',
      description: `Manalink ${slug} claimed: ${amount} from ${fromUser.username} to ${auth.uid}`,
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
