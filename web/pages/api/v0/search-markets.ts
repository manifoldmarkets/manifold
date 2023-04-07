import { FullMarket, toFullMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { searchContracts } from 'web/lib/service/algolia'
import { ApiError } from 'web/pages/api/v0/_types'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket[] | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { terms } = req.query
  const keywords = terms as string

  const contracts = await searchContracts(keywords, 100)
  res.status(200).json(contracts.map((c) => toFullMarket(c)))
}
