import { FullMarket, toFullMarket } from 'common/api-market-types'
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

  const { fuzzyOffset: _fuzzyOffset, data } = await searchContract({
    state: {
      contracts: undefined,
      fuzzyContractOffset: 0,
      shouldLoadMore: false,
      showTime: null,
    },
    query: keywords,
    filter: 'all',
    sort: 'most-popular',
    offset: 0,
    limit: 100,
  })
  res.status(200).json(data.map((c) => toFullMarket(c)))
}
