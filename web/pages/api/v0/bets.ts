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
    userId: z.string().optional(),
    username: z.string().optional(),
    contractId: z.string().optional(),
    contractSlug: z.string().optional(),
    market: z.string().optional(), // deprecated, synonym for `contractSlug`
    limit: z
      .number()
      .default(1000)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

const getContractId = async (params: z.infer<typeof queryParams>) => {
  if (params.contractId) {
    return params.contractId
  }
  const slug = params.contractSlug ?? params.market
  if (slug) {
    const contract = await getContractFromSlug(slug)
    if (contract) {
      return contract.id
    } else {
      throw new Error('Contract not found.')
    }
  }
}

const getUserId = async (params: z.infer<typeof queryParams>) => {
  if (params.userId) {
    return params.userId
  }
  if (params.username) {
    const user = await getUserByUsername(params.username)
    if (user) {
      return user.id
    } else {
      throw new Error('User not found.')
    }
  }
}

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

  const { limit, before } = params
  const [userId, contractId] = await Promise.all([
    getUserId(params),
    getContractId(params),
  ])
  const bets = await getBets({ userId, contractId, limit, before })

  res.setHeader('Cache-Control', 'max-age=15, public')
  return res.status(200).json(bets)
}
