import { FullMarket, toFullMarket } from 'common/api-market-types'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import { ApiError } from '../../_types'
import { getContract } from 'web/lib/supabase/contracts'
import { fetchBackend, forwardResponse } from 'web/lib/api/proxy'

export const marketCacheStrategy = 's-maxage=15, stale-while-revalidate=45'
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FullMarket | ApiError>
) {
  await applyCorsHeaders(req, res)
  const { id } = req.query
  const contractId = id as string
  const contract = await getContract(contractId)
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', marketCacheStrategy)
    return res.status(200).json(toFullMarket(contract))
  } else if (req.method === 'PATCH') {
    if (req.body) req.body.contractId = contractId
    try {
      const backendRes = await fetchBackend(req, 'updatemarket')
      await forwardResponse(res, backendRes)
    } catch (err) {
      console.error('Error talking to cloud function: ', err)
      res.status(500).json({ error: 'Error communicating with backend.' })
    }
  } else {
    res.status(405).send({ error: 'Only GET or PATCH requests allowed' })
  }
}
