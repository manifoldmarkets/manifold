import { drizzleLiquidity } from 'scheduler/jobs/drizzle-liquidity'
import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async () => {
    await drizzleLiquidity()
  })
}
