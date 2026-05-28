import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SweepstakesPrize } from 'common/sweepstakes'
import {
  getTotalPrizePool,
  getTotalWinnerCount,
} from 'common/sweepstakes'
import { tsToMillis } from 'common/supabase/utils'
import { createPrizeCampaignNotification } from 'shared/notifications/create-prize-campaign-notification'

// Admin-triggered "new prize drawing live" announcement. Sends one
// notification per eligible user (respecting the prize_drawings preference)
// and flips the sweepstakes.announcement_sent flag so the button can't be
// pressed twice for the same drawing. Pass dryRun: true to preview the
// title/body without sending.
export const adminAnnouncePrizeDrawing: APIHandler<
  'admin-announce-prize-drawing'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { sweepstakesNum, dryRun } = body
  const pg = createSupabaseDirectClient()

  const row = await pg.oneOrNone<{
    sweepstakes_num: number
    prizes: SweepstakesPrize[]
    close_time: string
    announcement_sent: boolean
  }>(
    `select sweepstakes_num, prizes, close_time, announcement_sent
     from sweepstakes
     where sweepstakes_num = $1`,
    [sweepstakesNum]
  )
  if (!row) throw new APIError(404, `Drawing #${sweepstakesNum} not found`)

  const totalPrizeUsd = getTotalPrizePool(row.prizes)
  const winnerCount = getTotalWinnerCount(row.prizes)
  const closeTime = tsToMillis(row.close_time)

  const title = `New prize drawing is live`
  const prizeText = `$${totalPrizeUsd.toLocaleString()}`
  const audienceText =
    winnerCount === 1 ? 'to one winner' : `across ${winnerCount} winners`
  const body_text = `${prizeText} ${audienceText}.`

  const previewPayload = {
    sweepstakesNum,
    title,
    body: body_text,
    totalPrizeUsd,
    winnerCount,
    closeTime,
    alreadySent: row.announcement_sent,
    sent: false,
  }

  if (dryRun) return previewPayload

  if (row.announcement_sent) {
    throw new APIError(
      409,
      `Announcement for drawing #${sweepstakesNum} has already been sent.`
    )
  }

  // Flip the flag FIRST in case the long-running send fails partway —
  // operators can manually flip it back if a re-send is genuinely needed.
  await pg.none(
    `update sweepstakes set announcement_sent = true where sweepstakes_num = $1`,
    [sweepstakesNum]
  )

  try {
    await createPrizeCampaignNotification(pg, {
      reason: 'prize_drawings',
      eventType: 'created',
      sourceSlug: `prize/${sweepstakesNum}`,
      title,
      body: body_text,
      data: {
        eventType: 'created',
        sweepstakesNum,
        totalPrizeUsd,
        closeTime,
        winnerCount,
      },
    })
  } catch (err) {
    // Best-effort rollback of the flag if the batch send blew up before
    // sending anything material. We can't undo partial sends.
    await pg.none(
      `update sweepstakes set announcement_sent = false where sweepstakes_num = $1`,
      [sweepstakesNum]
    )
    throw err
  }

  return { ...previewPayload, alreadySent: true, sent: true }
}
