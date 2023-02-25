import { ContractMetric } from 'common/contract-metric'
import { getContractMetricsForContractId } from 'common/supabase/contract-metrics'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { db } from 'web/lib/supabase/db'
import { ApiError } from '../../_types'
import { marketCacheStrategy } from '../../markets'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContractMetric[] | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  const { id } = req.query
  const contractId = id as string
  const contract = await getContractFromId(contractId)
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }
  const positions = await getContractMetricsForContractId(contractId, db)
  res.setHeader('Cache-Control', marketCacheStrategy)
  return res.status(200).json(positions)
}
