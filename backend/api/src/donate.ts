import { type APIHandler } from './helpers/endpoint'
import { charities } from 'common/charity'
import { APIError } from 'api/helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  MIN_CASH_DONATION,
  MIN_SPICE_DONATION,
  CHARITY_FEE,
  TWOMBA_ENABLED,
} from 'common/envs/constants'
import { getUser } from 'shared/utils'

export const donate: APIHandler<'donate'> = async ({ amount, to }, auth) => {
  const charity = charities.find((c) => c.id === to)
  if (!charity) throw new APIError(404, 'Charity not found')

  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    const user = await getUser(auth.uid, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    const balance = TWOMBA_ENABLED ? user.cashBalance : user.spiceBalance
    if (balance < amount) {
      throw new APIError(
        403,
        `Insufficient ${TWOMBA_ENABLED ? 'cash' : 'prize points'} balance`
      )
    }

    const min = TWOMBA_ENABLED ? MIN_CASH_DONATION : MIN_SPICE_DONATION
    if (amount < min) {
      throw new APIError(
        400,
        `Minimum donation is ${min} ${TWOMBA_ENABLED ? 'cash' : 'prize points'}`
      )
    }

    let donation: number

    if (TWOMBA_ENABLED) {
      donation = amount
    } else {
      // add donation to charity
      const fee = CHARITY_FEE * amount
      donation = amount - fee

      const feeTxn = {
        category: 'CHARITY_FEE',
        fromType: 'USER',
        fromId: auth.uid,
        toType: 'BANK',
        toId: 'BANK',
        amount: fee,
        token: TWOMBA_ENABLED ? 'CASH' : 'SPICE',
        data: {
          charityId: charity.id,
        },
      } as const

      await runTxn(tx, feeTxn)
    }

    const donationTxn = {
      category: 'CHARITY',
      fromType: 'USER',
      fromId: auth.uid,
      toType: 'CHARITY',
      toId: charity.id,
      amount: donation,
      token: TWOMBA_ENABLED ? 'CASH' : 'SPICE',
    } as const

    await runTxn(tx, donationTxn)
  })
}
