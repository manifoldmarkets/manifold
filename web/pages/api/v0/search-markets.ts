import { FullMarket, toFullMarket } from 'common/api-market-types'
import { Contract } from 'common/contract'
import { NextApiRequest, NextApiResponse } from 'next'
import { CORS_UNRESTRICTED, applyCorsHeaders } from 'web/lib/api/cors'
import { searchContract } from 'web/lib/supabase/contracts'
import { ApiError } from 'web/pages/api/v0/_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket[] | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { terms } = req.query
  const keywords = terms as string
  const { data: contracts } = (await searchContract({
    query: keywords,
    filter: 'all',
    sort: 'most-popular',
    limit: 100,
  })) as { data: Contract[] }
  res.status(200).json(contracts.map((c) => toFullMarket(c)))
}
