import { type APIHandler } from './helpers/endpoint'
import { charities } from 'common/charity'
import { APIError } from 'api/helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const donate: APIHandler<'donate'> = async ({ amount, to }, auth) => {
  const charity = charities.find((c) => c.id === to)
  if (!charity) throw new APIError(404, 'Charity not found')

  const pg = createSupabaseDirectClient()

  const txn = {
    category: 'CHARITY',
    fromType: 'USER',
    fromId: auth.uid,
    toType: 'CHARITY',
    toId: charity.id,
    amount: amount,
    token: 'SPICE',
  } as const

  await pg.tx((tx) => runTxn(tx, txn))
}
