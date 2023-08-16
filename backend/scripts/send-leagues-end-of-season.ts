import { runScript } from 'run-script'
import { sendEndOfSeasonNotificationsAndBonuses } from 'shared/payout-leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    await sendEndOfSeasonNotificationsAndBonuses(pg, 3)
    console.log('Completed send end of season notification and bonuses')
  })
}
