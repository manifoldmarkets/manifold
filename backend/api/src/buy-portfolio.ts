import { APIError, authEndpoint, validate } from './helpers'
import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertPortfolio } from 'common/portfolio'
import { placeBetMain } from './place-bet'

const schema = z.object({
  portfolioId: z.string(),
  amount: z.number(),
})

export const buyportfolio = authEndpoint(async (req, auth) => {
  const { portfolioId, amount } = validate(schema, req.body)

  const db = createSupabaseDirectClient()

  const user = await db.one(
    'select data from users where id = $1',
    [auth.uid],
    (row) => row.data
  )

  if (!user) {
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  }

  if (user.balance < amount) {
    throw new APIError(400, 'Insufficient balance')
  }

  const portfolio = await db.one(
    'select * from portfolios where id = $1',
    [portfolioId],
    convertPortfolio
  )

  if (!portfolio) {
    throw new APIError(400, 'No portfolio exists with the given ID.')
  }

  for (const item of portfolio.items) {
    const { contractId, position } = item
    const itemAmount = amount / portfolio.items.length
    await placeBetMain(
      {
        contractId,
        outcome: position,
        amount: itemAmount,
      },
      user.id,
      auth.creds.kind === 'key'
    )
  }

  return { status: 'success' }
})
