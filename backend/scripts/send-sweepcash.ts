import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { runScript } from 'run-script'
import { runTxn } from 'shared/txn/run-txn'

// Change these to insert different txns
const groupId = 'additional-kyc-gift'
const amounts = [
  { id: '5LZ4LgYuySdL1huCWe7bti02ghx2', amount: 290.6006599286618 }, // James
  { id: 'Rcnau899SsWFEuL0ukY1hMGkath2', amount: 24.300307345553185 }, // Alex Miller
  // { id: 'tlmGNz9kjXc2EteizMORes4qvWl2', amount: 1048.4065420277594 }, // SG
  { id: 'eBUNDUcrRMYeoRqfFsEcA0UonV33', amount: 0.00941605912381928 }, // jan
  { id: 'XtJuqIcTwEa5WnmBtmypEKyjlfu1', amount: 112.2789688018984 }, // Henri Thunberg 🔸
  // { id: 'AJwLWoo3xue32XIiAVrL5SyR1WB2', amount: 32.866559589740005 }, // Ian Philips
  { id: 'tNQuBL6vsShm46bi4ciIWxcMTmR2', amount: 21.85886754045586 }, // Dan Wahl
  { id: 'zNIw5HrrF9QygZZhTiciun5GEef2', amount: 0.02294625926951672 }, // bob henry
  { id: 'd9vxoU9czxR8HkgfMdwwTmVBQ3y2', amount: 0.8558657801231295 }, // Bence
]

if (require.main === module) {
  const message = process.argv[2]
  if (!message) {
    console.error('Please provide a message as the first argument')
    process.exit(1)
  }

  runScript(async ({ pg }) => {
    await pg.tx(async (tx) => {
      for (const { id, amount } of amounts) {
        await runTxn(tx, {
          fromType: 'USER',
          fromId: HOUSE_LIQUIDITY_PROVIDER_ID,
          toType: 'USER',
          toId: id,
          amount,
          token: 'CASH',
          category: 'MANA_PAYMENT',
          data: {
            message,
            groupId,
            visibility: 'public',
          },
          description: message,
        })
        console.log(`Sent $${amount} in sweepstakes cash to ${id}`)
      }
    })

    console.log('complete')
  })
}
