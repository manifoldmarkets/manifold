import { toLiteMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { marketCacheStrategy } from 'web/pages/api/v0/market/[id]'
import { getGroupMarkets } from 'web/lib/supabase/group'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contracts = (await getGroupMarkets(id as string))?.map((contract) =>
    toLiteMarket(contract)
  )
  if (!contracts) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  res.setHeader('Cache-Control', marketCacheStrategy)
  return res.status(200).json(contracts)
}
