import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import { incrementBalance } from 'shared/supabase/users'
import { insertTxn } from 'shared/txn/run-txn'
import { log } from 'shared/utils'
import { runScript } from './run-script'

runScript(async ({ pg }) => {
  // Get all market ads with remaining funds
  const ads = await pg.manyOrNone(
    `select id, user_id, funds::numeric, market_id
     from market_ads
     where funds > 0`
  )

  log(`Found ${ads.length} ads with remaining funds`)

  // Process each ad in sequence
  for (const ad of ads) {
    await tryOrLogError(
      pg.tx(async (tx) => {
        const amount = parseFloat(ad.funds)

        // Create txn to return funds to creator
        await insertTxn(tx, {
          category: 'MARKET_BOOST_REDEEM',
          fromType: 'AD',
          fromId: ad.id,
          toType: 'USER',
          toId: ad.user_id,
          amount: amount,
          token: 'M$',
          description: 'Return market ad funds to creator',
        })

        await incrementBalance(tx, ad.user_id, {
          balance: amount,
          totalDeposits: amount,
        })

        // Set funds to 0
        await tx.none(
          `update market_ads
           set funds = funds - $2
           where id = $1`,
          [ad.id, amount]
        )

        log(
          `Returned ${ad.funds} M$ to user ${ad.user_id} for market ${ad.market_id}`
        )
      })
    )
  }

  log('Finished returning market ad funds')
})
