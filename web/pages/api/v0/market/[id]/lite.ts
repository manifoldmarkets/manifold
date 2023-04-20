import { LiteMarket, toLiteMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { ApiError } from '../../_types'
import { marketCacheStrategy } from 'web/pages/api/v0/market/[id]/index'
import { getPublicContract } from 'web/lib/supabase/contracts'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteMarket | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contractId = id as string

  const contract = await getPublicContract(contractId)

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  res.setHeader('Cache-Control', marketCacheStrategy)
  return res.status(200).json(toLiteMarket(contract))
}
