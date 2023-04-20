import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { Bet } from 'common/bet'
import { getBet, getPublicBets } from 'web/lib/supabase/bets'
import { getContractFromSlug } from 'web/lib/supabase/contracts'
import { getUserByUsername } from 'web/lib/firebase/users'
import { ApiError, ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'
import { db } from 'web/lib/supabase/db'

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
    const contract = await getContractFromSlug(slug, db)
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

// mqp: this pagination approach is technically incorrect if multiple bets
// have the exact same createdTime, but that's very unlikely

const getBeforeTime = async (params: z.infer<typeof queryParams>) => {
  if (params.before) {
    const beforeBet = await getBet(params.before)
    if (beforeBet == null) {
      throw new Error('Bet specified in before parameter not found.')
    }
    return beforeBet.createdTime
  } else {
    return undefined
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

  const { limit } = params
  try {
    const [userId, contractId, beforeTime] = await Promise.all([
      getUserId(params),
      getContractId(params),
      getBeforeTime(params),
    ])
    const bets = await getPublicBets({ userId, contractId, beforeTime, limit })

    res.setHeader('Cache-Control', 'max-age=15, public')
    return res.status(200).json(bets)
  } catch (e) {
    console.error(`Error while fetching bets: ${e}`)
    return res.status(500).json({ error: 'Error while fetching bets: ' + e })
  }
}
