import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { DAY_MS } from 'common/util/time'
import { createMarketClosedNotification } from 'shared/create-notification'
import { updateContract } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserAndPrivateUserOrThrow, isProd, log } from 'shared/utils'

const SEND_NOTIFICATIONS_EVERY_DAYS = 5
export async function sendMarketCloseEmails() {
  if (!isProd()) {
    log('Not prod, not sending emails')
    return
  }
  const manifoldLoveUserId = 'tRZZ6ihugZQLXPf6aPRneGpWLmz1'

  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(
    `select * from contracts where
      resolution_time is null and close_time < now()
      and outcome_type not in ('POLL', 'BOUNTIED_QUESTION')
      and creator_id != $1`,
    [manifoldLoveUserId],
    convertContract
  )

  log(`Found ${contracts.length} closed contracts`)

  // Determine which contracts need a close email now (catch up after downtime)
  const eligibleContracts = contracts.filter((contract) => {
    const shouldHaveSent = expectedCloseEmailsCount(contract)
    const alreadySent = contract.closeEmailsSent ?? 0
    return alreadySent < shouldHaveSent
  })

  log(`Found ${eligibleContracts.length} notifications to send`)
  for (const contract of eligibleContracts) {
    const shouldHaveSent = expectedCloseEmailsCount(contract)
    // Send the most recent pending period, then catch-up the counter
    const periodIndexToSend = Math.max(0, shouldHaveSent - 1)

    const sendToId =
      contract.token === 'CASH'
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : contract.creatorId
    const userAndPrivateUser = await getUserAndPrivateUserOrThrow(sendToId)
    const { user, privateUser } = userAndPrivateUser

    // Make idempotency key unique per 5-day period since close
    const idempotencyKey =
      contract.id +
      '-closed-at-' +
      contract.closeTime +
      '-period-' +
      periodIndexToSend
    try {
      await pg.tx(async (tx) => {
        await createMarketClosedNotification(
          contract,
          user,
          privateUser,
          idempotencyKey
        )
        // Only mark as sent after successful notification/email send
        // Catch up immediately to the expected count to avoid sending one per hour
        await updateContract(tx, contract.id, {
          closeEmailsSent: shouldHaveSent,
        })
      })
    } catch (e) {
      console.error('Failed sending close email for', contract.id, e)
    }
  }
}

// Send one email immediately on close, then every N days after.
// If the scheduler was down, we catch up by comparing how many emails should have
// been sent vs how many were recorded as sent.
function expectedCloseEmailsCount(contract: Contract) {
  const now = Date.now()
  const closeTime = contract.closeTime
  if (!closeTime) return 0
  const daysSinceClose = Math.floor((now - closeTime) / DAY_MS)
  // +1 accounts for the initial email at day 0
  return Math.floor(daysSinceClose / SEND_NOTIFICATIONS_EVERY_DAYS) + 1
}
