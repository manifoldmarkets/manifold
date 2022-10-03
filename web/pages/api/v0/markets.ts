// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllContracts } from 'web/lib/firebase/contracts'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { toLiteMarket, ValidationError } from './_types'
import { z } from 'zod'
import { validate } from './_validate'

export const marketCacheStrategy = 's-maxage=15, stale-while-revalidate=45'

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

  const { limit, before } = params

  try {
    const contracts = await listAllContracts(limit, before)
    // Serve from Vercel cache, then update. see https://vercel.com/docs/concepts/functions/edge-caching
    res.setHeader('Cache-Control', marketCacheStrategy)
    res.status(200).json(contracts.map(toLiteMarket))
  } catch (e) {
    res.status(400).json({
      error:
        'Failed to fetch markets (did you pass an invalid ID as the before parameter?)',
    })
    return
  }
}
