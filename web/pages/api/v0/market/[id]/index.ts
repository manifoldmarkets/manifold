import { FullMarket, toFullMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { ApiError } from '../../_types'
import { getPublicContract } from 'web/lib/supabase/contracts'

export const marketCacheStrategy = 's-maxage=15, stale-while-revalidate=45'
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket | ApiError>
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
  return res.status(200).json(toFullMarket(contract))
}
