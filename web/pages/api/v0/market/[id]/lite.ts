import { NextApiRequest, NextApiResponse } from 'next'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { ApiError, toLiteMarket, LiteMarket } from '../../_types'
import { marketCacheStrategy } from '../../markets'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LiteMarket | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contractId = id as string

  const contract = await getContractFromId(contractId)

  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }

  res.setHeader('Cache-Control', marketCacheStrategy)
  return res.status(200).json(toLiteMarket(contract))
}
