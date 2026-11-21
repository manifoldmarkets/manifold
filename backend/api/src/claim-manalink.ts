import { z } from 'zod'
import { canSendMana } from 'common/can-send-mana'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { getActiveUserBans } from './helpers/rate-limit'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { SupabaseTransaction } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { Row, tsToMillis } from 'common/supabase/utils'
import { getUser } from 'shared/utils'
import { broadcastUserUpdates, UserUpdate } from 'shared/supabase/users'

const bodySchema = z.object({ slug: z.string() }).strict()

export const claimmanalink = authEndpoint(async (req, auth) => {
  const { slug } = validate(bodySchema, req.body)

  const run = async (tx: SupabaseTransaction) => {
    // Lock the manalink row so concurrent claims of the same link run one at a
    // time: each one then counts the claims committed before it.
    const manalink = await tx.oneOrNone<Row<'manalinks'>>(
      `select * from manalinks where id = $1 for update`,
      [slug]
    )

    if (!manalink) {
      throw new APIError(404, 'Manalink not found')
    }

    const { amount, creator_id, expires_time, max_uses } = manalink

    // The claimant is the txn's to_id column; txn data holds only the description.
    const claimedUserIds = await tx.map(
      `select txns.to_id from manalink_claims
         join txns on txns.id = manalink_claims.txn_id
         where manalink_id = $1`,
      [slug],
      (r: { to_id: string }) => r.to_id
    )

    if (auth.uid === creator_id)
      throw new APIError(403, `You can't claim your own manalink`)

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

    const fromUser = await getUser(creator_id, tx)
    if (!fromUser) {
      throw new APIError(500, `User ${creator_id} not found`)
    }

    // Fetch bans for the sender
    const fromUserBans = await getActiveUserBans(creator_id, tx)

    const { canSend, message } = canSendMana(fromUser, fromUserBans)
    if (!canSend) {
      throw new APIError(403, message)
    }

    const toUser = await getUser(auth.uid, tx)
    if (!toUser) {
      throw new APIError(401, 'Your account was not found')
    }

    const data = {
      fromId: creator_id,
      fromType: 'USER',
      toId: auth.uid,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'MANALINK',
      // The slug is a bearer secret, so keep it out of the description.
      description: `Manalink claimed: ${amount} by ${toUser.username}`,
    } as const

    // A converter can hold a user row between two queued transfers. Waiting in
    // that same queue while holding the manalink lock creates a queue/row cycle.
    const userUpdates: UserUpdate[] = []
    const txn = await runTxnOutsideBetQueue(tx, data, false, (updates) => {
      userUpdates.push(...updates)
    })
    await tx.none(
      `insert into manalink_claims (txn_id, manalink_id) values ($1, $2)`,
      [txn.id, slug]
    )
    return userUpdates
  }

  // Opposite-direction transfers can still deadlock on user rows. Retry the
  // whole claim, rechecking committed claims after reacquiring the link lock.
  const userUpdates = await runTransactionWithRetries(run, 3, {
    mode: 'default',
    isExpectedError: (error) => error instanceof APIError,
  })

  // Only the successful attempt escapes the retry callback. Aborted attempts
  // must never expose their uncommitted balances to websocket subscribers.
  broadcastUserUpdates(userUpdates)

  return { message: 'Manalink claimed' }
})
