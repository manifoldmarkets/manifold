import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const txnSchema = z
  .object({
    fromType: z.enum(['USER']),
    fromId: z.string(),
    amount: z.number().positive().safe(),
    toType: z.enum(['CHARITY']),
    toId: z.string(),
    token: z.enum(['M$']),
    category: z.string(),
    description: z.string().optional(),
  })
  .strict()

export const transact = authEndpoint(async (req, auth) => {
  const data = req.body
  const { fromId } = validate(txnSchema, data)

  if (fromId !== auth.uid)
    throw new APIError(403, 'You can only send txns from yourself!')

  const pg = createSupabaseDirectClient()
  return pg.tx((tx) => runTxn(tx, data))
})
