// Next.js API route support: https://vercel.com/docs/concepts/functions/serverless-functions
import type { NextApiRequest, NextApiResponse } from 'next'
import { listAllContracts } from 'web/lib/firebase/contracts'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { toLiteMarket } from './_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  let before: string | undefined
  let limit: number | undefined
  if (req.query.before != null) {
    if (typeof req.query.before !== 'string') {
      res.status(400).json({ error: 'before must be null or a market ID.' })
      return
    }
    before = req.query.before
  }
  if (req.query.limit != null) {
    if (typeof req.query.limit !== 'string') {
      res
        .status(400)
        .json({ error: 'limit must be null or a number of markets to return.' })
      return
    }
    limit = parseInt(req.query.limit)
  } else {
    limit = 1000
  }
  if (limit < 1 || limit > 1000) {
    res.status(400).json({ error: 'limit must be between 1 and 1000.' })
    return
  }

  try {
    const contracts = await listAllContracts(limit, before)
    // Serve from Vercel cache, then update. see https://vercel.com/docs/concepts/functions/edge-caching
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate')
    res.status(200).json(contracts.map(toLiteMarket))
  } catch (e) {
    res.status(400).json({
      error:
        'Failed to fetch markets (did you pass an invalid ID as the before parameter?)',
    })
    return
  }
}
