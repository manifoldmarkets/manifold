import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { Bet, getBets } from 'web/lib/firebase/bets'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { getUserByUsername } from 'web/lib/firebase/users'
import { ApiError, ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'

const queryParams = z
  .object({
    username: z.string().optional(),
    market: z.string().optional(),
    limit: z
      .number()
      .default(1000)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Bet[] | ValidationError | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)

  let params: z.infer<typeof queryParams>
  try {
    params = validate(queryParams, req.query)
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json(e)
    }
    console.error(`Unknown error during validation: ${e}`)
    return res.status(500).json({ error: 'Unknown error during validation' })
  }

  const { username, market, limit, before } = params

  let userId: string | undefined
  if (username) {
    const user = await getUserByUsername(username)
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    userId = user.id
  }

  let contractId: string | undefined
  if (market) {
    const contract = await getContractFromSlug(market)
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' })
      return
    }
    contractId = contract.id
  }

  const bets = await getBets({ userId, contractId, limit, before })

  res.setHeader('Cache-Control', 'maxage=15')
  return res.status(200).json(bets)
}
