import { initAdmin } from './script-init'
initAdmin()

import { drizzleLiquidity } from '../drizzle-liquidity'

if (require.main === module) {
  drizzleLiquidity().then(() => process.exit())
}
