import { LiteMarket, toLiteMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { APIError, searchContracts } from 'web/lib/firebase/api'
import { marketCacheStrategy } from 'web/pages/api/v0/market/[id]'
import { ApiError } from 'web/pages/api/v0/_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteMarket[] | ApiError>
) {
  await applyCorsHeaders(req, res, {
    methods: 'GET',
  })

  const { limit, offset, ...rest } = req.query
  // "terms" is a legacy query param for the search term
  const term = req.query.term ?? req.query.terms

  const body = {
    term,
    limit: typeof limit === 'string' ? parseInt(limit) : undefined,
    offset: typeof offset === 'string' ? parseInt(offset) : undefined,
    ...rest,
  }

  try {
    const contracts = await searchContracts(body as any)
    const liteContracts = contracts.map(toLiteMarket)
    res.setHeader('Cache-Control', marketCacheStrategy)
    res.status(200).json(liteContracts)
  } catch (err) {
    if (err instanceof APIError) {
      console.error(err.name)
      res.status(err.code).json(err.details as any)
    } else {
      console.error('Error talking to cloud function: ', err)
      res.status(500).json(err as any)
    }
  }
}
