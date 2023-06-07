import { runScript } from 'run-script'
import { sendEndOfSeasonNotificationsAndBonuses } from 'shared/payout-leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'

    await sendEndOfSeasonNotificationsAndBonuses(pg, 1)
    console.log('Completed send end of season notification and bonuses')
  })
}
