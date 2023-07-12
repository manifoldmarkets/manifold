import { runScript } from 'run-script'
import { generateNextSeason, insertBots } from 'shared/generate-leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // James prod user id
    // const userId = '5LZ4LgYuySdL1huCWe7bti02ghx2'

    const newSeason = 3
    await generateNextSeason(pg, newSeason)
    await insertBots(pg, newSeason)
    console.log('Completed generateNextSeason.')
  })
}
