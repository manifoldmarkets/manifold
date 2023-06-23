// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import { toLiteQuestion } from 'common/api-question-types'
import type { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'
import {
  getPublicContract,
  getPublicContracts,
} from 'web/lib/supabase/contracts'

const queryParams = z
  .object({
    limit: z
      .number()
      .default(500)
      .or(z.string().regex(/\d+/).transform(Number))
      .refine((n) => n >= 0 && n <= 1000, 'Limit must be between 0 and 1000'),
    before: z.string().optional(),
  })
  .strict()

// mqp: this pagination approach is technically incorrect if multiple contracts
// have the exact same createdTime, but that's very unlikely
const getBeforeTime = async (params: z.infer<typeof queryParams>) => {
  if (params.before) {
    const beforeContract = await getPublicContract(params.before)
    if (beforeContract == null) {
      throw new Error('Contract specified in before parameter not found.')
    }
    return beforeContract.createdTime
  } else {
    return undefined
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
    const beforeTime = await getBeforeTime(params)
    const contracts = await getPublicContracts({ limit, beforeTime })
    // Serve from Vercel cache, then update. see https://vercel.com/docs/concepts/functions/edge-caching
    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=45')
    res.status(200).json(contracts.map(toLiteQuestion))
  } catch (e) {
    res.status(400).json({
      error:
        'Failed to fetch questions (did you pass an invalid ID as the before parameter?)',
    })
    return
  }
}
