import { ContractMetric } from 'common/contract-metric'
import { getContractMetricsForContractId } from 'common/supabase/contract-metrics'
import { uniqBy } from 'lodash'
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
  const { id, top, bottom, order } = req.query
  const contractId = id as string
  const contract = await getContractFromId(contractId)
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }
  if (order && !['profit', 'shares'].includes(order as string)) {
    res.status(400).json({ error: 'Invalid order, must be shares or profit' })
    return
  }

  const contractMetrics = await getContractMetricsForContractId(
    contractId,
    db,
    order ? (order as 'profit' | 'shares') : undefined
  )
  res.setHeader('Cache-Control', marketCacheStrategy)
  if (top && !bottom) {
    const topPositions = parseInt(top as string)
    res.status(200).json(contractMetrics.slice(0, topPositions))
  } else if (bottom && !top) {
    const bottomPositions = parseInt(bottom as string)
    res.status(200).json(contractMetrics.slice(-bottomPositions))
  } else if (top && bottom) {
    const topPositions = parseInt(top as string)
    const bottomPositions = parseInt(bottom as string)
    res
      .status(200)
      .json(
        uniqBy(
          contractMetrics
            .slice(0, topPositions)
            .concat(contractMetrics.slice(-bottomPositions)),
          (cm) => cm.userId
        )
      )
  } else {
    return res.status(200).json(contractMetrics)
  }
}
