import { runScript } from 'run-script'
import { generateNextSeason } from 'shared/leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'

    await generateNextSeason(pg, 1)
    console.log('Completed generateNextSeason.')
  })
}
