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

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    process.stdout.write(query)
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim())
    })
  })
}

if (require.main === module) {
  runScript(async ({ pg }) => {
    const amount = await askQuestion(
      'Enter the amount to top up: '
    )
    const token = await askQuestion('Enter the token (M$ / CASH): ')

    const confirmedAmount = amount ? parseInt(amount) : 0
    if (isNaN(confirmedAmount) || !Number.isInteger(confirmedAmount) || confirmedAmount < 1 || confirmedAmount > 1000000) {
      console.error('Invalid amount. Please enter an integer between 1 and 1,000,000.');
      process.exit(1);
    }
    const confirmedToken = token.toUpperCase()
    if (confirmedToken !== 'M$' && confirmedToken !== 'CASH') {
      console.error('Invalid token. Please enter either M$ or CASH.')
      process.exit(1)
    }

    console.log(`Confirming: Top up ${confirmedAmount} ${token}`)
    const confirm = await askQuestion('Proceed? (y/n): ')

    if (confirm.toLowerCase() === 'y') {
      await pg.tx(async (tx) => {
        await runTxnFromBank(tx, {
          amount: confirmedAmount,
          description: 'Top up Manifold account',
          category: 'MANIFOLD_TOP_UP',
          fromType: 'BANK',
          toType: 'USER',
          toId: userId,
          token: confirmedToken as 'M$' | 'SHARE' | 'SPICE' | 'CASH',
        })
      })
      console.log('Transaction completed.')
    } else {
      console.log('Transaction cancelled.')
    }

    process.exit(0)
  })
}
