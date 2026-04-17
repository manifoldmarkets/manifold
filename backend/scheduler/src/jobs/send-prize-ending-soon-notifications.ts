import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { getTotalPrizePool, SweepstakesPrize } from 'common/sweepstakes'
import { formatMoneyUSD } from 'common/util/format'
import { createPrizeCampaignNotification } from 'shared/notifications/create-prize-campaign-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { JobContext } from './helpers'

export async function sendPrizeEndingSoonNotifications({
  lastStartTime,
}: JobContext) {
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  // Use the previous run's START time (not end time) so consecutive runs'
  // windows abut exactly at `prevStart + 2h`. Using end time would leave a
  // gap equal to the previous run's runtime, permanently missing any items
  // whose close_time falls inside that sliver.
  const previousRunTime = lastStartTime ?? now - 5 * MINUTE_MS
  const previousThreshold = new Date(previousRunTime + 2 * HOUR_MS).toISOString()
  const currentThreshold = new Date(now + 2 * HOUR_MS).toISOString()
  const nowIso = new Date(now).toISOString()

  const endingSoonSweepstakes = await pg.manyOrNone<{
    sweepstakes_num: number
    prizes: SweepstakesPrize[]
    close_time: string
  }>(
    `select sweepstakes_num, prizes, close_time
     from sweepstakes
     where close_time > $1
       and close_time <= $2
       and close_time > $3`,
    [previousThreshold, currentThreshold, nowIso]
  )

  for (const sweepstakes of endingSoonSweepstakes) {
    try {
      const totalPrizeUsd = getTotalPrizePool(sweepstakes.prizes)
      await createPrizeCampaignNotification(pg, {
        reason: 'prize_drawings',
        eventType: 'ending_soon',
        sourceSlug: `prize/${sweepstakes.sweepstakes_num}`,
        title: `Prize Drawing #${sweepstakes.sweepstakes_num} ends soon`,
        body: `${formatMoneyUSD(totalPrizeUsd)} in total prizes. Ends in about 2 hours.`,
        data: {
          eventType: 'ending_soon',
          sweepstakesNum: sweepstakes.sweepstakes_num,
          totalPrizeUsd,
          closeTime: new Date(sweepstakes.close_time).valueOf(),
        },
      })
    } catch (err) {
      log.error(
        `Failed to send ending-soon notifications for Prize Drawing #${sweepstakes.sweepstakes_num}`,
        { err }
      )
    }
  }

  const endingSoonGiveaways = await pg.manyOrNone<{
    giveaway_num: number
    prize_amount_usd: number
    close_time: string
  }>(
    `select giveaway_num, prize_amount_usd, close_time
     from charity_giveaways
     where close_time > $1
       and close_time <= $2
       and close_time > $3`,
    [previousThreshold, currentThreshold, nowIso]
  )

  for (const giveaway of endingSoonGiveaways) {
    try {
      await createPrizeCampaignNotification(pg, {
        reason: 'charity_giveaways',
        eventType: 'ending_soon',
        sourceSlug: `charity/${giveaway.giveaway_num}`,
        title: `Charity Giveaway #${giveaway.giveaway_num} ends soon`,
        body: `${formatMoneyUSD(giveaway.prize_amount_usd)} prize amount. Ends in about 2 hours.`,
        data: {
          eventType: 'ending_soon',
          giveawayNum: giveaway.giveaway_num,
          prizeAmountUsd: giveaway.prize_amount_usd,
          closeTime: new Date(giveaway.close_time).valueOf(),
        },
      })
    } catch (err) {
      log.error(
        `Failed to send ending-soon notifications for Charity Giveaway #${giveaway.giveaway_num}`,
        { err }
      )
    }
  }
}
