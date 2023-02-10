import { initAdmin } from 'shared/init-admin'
initAdmin()

import { drizzleLiquidity } from 'functions/drizzle-liquidity'

if (require.main === module) {
  drizzleLiquidity().then(() => process.exit())
}
