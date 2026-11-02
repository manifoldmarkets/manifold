import { runScript } from 'run-script'
import {
  getQuestWeekStart,
  MARKET_CREATION_QUESTS,
  QUEST_DETAILS,
} from 'common/quest'
import {
  getUnpaidMarketCreationQuests,
  payMarketCreationQuests,
} from 'shared/complete-quest-internal'
import { getUser } from 'shared/utils'

// Pays this week's creation quests to users who already qualify but haven't
// been paid: after the 3-question quest launches mid-week, and for creators
// the old week-start math skipped (the week DST ended). It uses the live
// payout path, so each quest still pays at most once per week and reruns are
// safe. Dry run by default; pass --apply to pay.
if (require.main === module) {
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')
    const weekStart = getQuestWeekStart()
    const minCount = Math.min(
      ...MARKET_CREATION_QUESTS.map((q) => QUEST_DETAILS[q].requiredCount)
    )
    const creators = await pg.manyOrNone<{ creator_id: string; count: number }>(
      `select creator_id, count(*)::int as count from contracts
      where created_time >= millis_to_ts($1)
      group by creator_id
      having count(*) >= $2`,
      [weekStart, minCount]
    )
    console.log(
      `Week starting ${new Date(weekStart).toISOString()}: ${
        creators.length
      } creators`
    )

    let payouts = 0
    for (const { creator_id, count } of creators) {
      const unpaid = await getUnpaidMarketCreationQuests(
        pg,
        creator_id,
        weekStart,
        count
      )
      if (unpaid.length === 0) continue
      payouts += unpaid.length
      console.log(creator_id, `${count} questions`, unpaid.join(', '))
      if (!apply) continue
      const user = await getUser(creator_id)
      if (!user) {
        console.log('No user found for', creator_id)
        continue
      }
      await payMarketCreationQuests(user, weekStart, count)
    }
    console.log(
      apply
        ? `Paid up to ${payouts} quest rewards (zero-multiplier accounts get none)`
        : `${payouts} quest rewards due. Dry run: pass --apply to pay.`
    )
  })
}
