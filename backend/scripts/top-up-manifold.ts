import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { runScript } from 'run-script'
import { isProd } from 'shared/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'

const userId = isProd()
  ? HOUSE_LIQUIDITY_PROVIDER_ID
  : DEV_HOUSE_LIQUIDITY_PROVIDER_ID

if (require.main === module) {
  runScript(async ({ pg }) => {
    await pg.tx(async (tx) => {
      await runTxnFromBank(tx, {
        amount: 1_000_000,
        description: 'Top up Manifold account',
        category: 'MANIFOLD_TOP_UP',
        fromType: 'BANK',
        toType: 'USER',
        toId: userId,
        token: 'M$',
      })
    })
  })
}
