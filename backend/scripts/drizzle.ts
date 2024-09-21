import { initAdmin } from 'shared/init-admin'
initAdmin()

import { drizzleLiquidity } from 'scheduler/jobs/drizzle-liquidity'

if (require.main === module) {
  drizzleLiquidity().then(() => process.exit())
}
