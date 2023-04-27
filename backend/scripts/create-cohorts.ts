import { runScript } from 'run-script'
import { assignCohorts } from 'shared/leagues'


if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'

    await assignCohorts(pg)
    console.log('Completed create cohorts.')
  })
}
