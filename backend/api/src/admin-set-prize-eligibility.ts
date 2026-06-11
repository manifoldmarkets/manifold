import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'
import { runTxnFromBank } from 'shared/txn/run-txn'

export const adminSetPrizeEligibility: APIHandler<
  'admin-set-prize-eligibility'
> = async (body, auth) => {
  const {
    userId,
    prizeEligibility,
    voidOutstandingEntries = false,
    reason,
  } = body

  throwErrorIfNotAdmin(auth.uid)

  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot modify admin account prize eligibility')
  }

  const pg = createSupabaseDirectClient()

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  let voidedEntryCount = 0
  let refundedManaTotal = 0

  await pg.tx(async (tx) => {
    if (prizeEligibility === null) {
      // Clear the override - prize eligibility falls back to identity
      // verification (canEnterPrizeDrawings derives from isIdentityVerified,
      // i.e. verified/grandfathered, when unset — NOT full bonus access, so
      // bonus-only 'eligible' purchasers stay gated)
      await updateUser(tx, userId, {
        prizeEligibility: FieldVal.delete() as any,
      })
      log(
        `Admin ${auth.uid} cleared prizeEligibility for user ${userId} (follows identity verification)`
      )
    } else {
      await updateUser(tx, userId, { prizeEligibility })
      log(
        `Admin ${auth.uid} set prizeEligibility to '${prizeEligibility}' for user ${userId}`
      )
    }

    // Refund + void only makes sense when blocking prize access. We don't
    // void on 'eligible' or 'clear' — those are restoration paths.
    if (!voidOutstandingEntries || prizeEligibility !== 'ineligible') return

    // Find unresolved tickets for this user — drawings where winners haven't
    // been picked yet. We don't void tickets in already-resolved drawings:
    // those are sunk costs, and the claim-time eligibility guard handles the
    // case where the user was a winner there.
    //
    // Concurrency: FOR UPDATE OF t blocks any concurrent invocation of this
    // endpoint at the same SELECT — the second caller waits until the first
    // commits. After the first commits, the rows it touched have voided_at
    // stamped, so the second caller's WHERE voided_at IS NULL excludes them
    // and only any unprocessed rows remain. Net: a ticket is voided + refunded
    // at most once, even under concurrent admin clicks. No SERIALIZABLE needed.
    const tickets = await tx.manyOrNone<{
      id: string
      sweepstakes_num: number
      mana_spent: string
      is_free: boolean
    }>(
      `SELECT t.id, t.sweepstakes_num, t.mana_spent, t.is_free
         FROM sweepstakes_tickets t
         JOIN sweepstakes s ON s.sweepstakes_num = t.sweepstakes_num
        WHERE t.user_id = $1
          AND t.voided_at IS NULL
          AND (
            s.winning_ticket_ids IS NULL
            OR array_length(s.winning_ticket_ids, 1) IS NULL
          )
        FOR UPDATE OF t`,
      [userId]
    )

    const voidReason = reason ?? 'admin-flagged-prize-ineligible'

    for (const ticket of tickets) {
      await tx.none(
        `UPDATE sweepstakes_tickets
            SET voided_at = NOW(), voided_reason = $1
          WHERE id = $2`,
        [voidReason, ticket.id]
      )
      voidedEntryCount++

      const manaSpent = parseFloat(ticket.mana_spent)
      // Free tickets (is_free / mana_spent = 0) get voided for audit but
      // there's nothing to refund.
      if (!ticket.is_free && manaSpent > 0) {
        await runTxnFromBank(tx, {
          fromType: 'BANK',
          toId: userId,
          toType: 'USER',
          amount: manaSpent,
          token: 'M$',
          category: 'SWEEPSTAKES_ENTRIES_VOIDED',
          description: `Refund for voided sweepstakes entry ${ticket.id}`,
          data: {
            sweepstakesNum: ticket.sweepstakes_num,
            entryId: ticket.id,
            voidedReason: voidReason,
          },
        })
        refundedManaTotal += manaSpent
      }
    }

    if (voidedEntryCount > 0) {
      log(
        `Voided ${voidedEntryCount} outstanding entries and refunded ${refundedManaTotal} mana for user ${userId}`
      )
    }
  })

  return { success: true, voidedEntryCount, refundedManaTotal }
}
