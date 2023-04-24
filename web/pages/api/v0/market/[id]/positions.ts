import { ContractMetric } from 'common/contract-metric'
import {
  getContractMetricsForContractId,
  getUserContractMetrics,
} from 'common/supabase/contract-metrics'
import { uniqBy } from 'lodash'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders, CORS_UNRESTRICTED } from 'web/lib/api/cors'
import { db } from 'web/lib/supabase/db'
import { validate } from 'web/pages/api/v0/_validate'
import { z } from 'zod'
import { ApiError, ValidationError } from '../../_types'
import { marketCacheStrategy } from 'web/pages/api/v0/market/[id]/index'
import { getContract } from 'web/lib/supabase/contracts'

const queryParams = z.object({
  id: z.string(),
  userId: z.string().optional().optional(),
  top: z.number().optional().or(z.string().regex(/\d+/).transform(Number)),
  bottom: z.number().optional().or(z.string().regex(/\d+/).transform(Number)),
  order: z.string().optional(),
})
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContractMetric[] | ValidationError | ApiError>
) {
  await applyCorsHeaders(req, res, CORS_UNRESTRICTED)
  let params: z.infer<typeof queryParams>
  try {
    params = validate(queryParams, req.query)
  } catch (e) {
    if (e instanceof ValidationError) {
      return res.status(400).json(e)
    }
    console.error(`Unknown error during validation: ${e}`)
    return res.status(500).json({ error: 'Unknown error during validation' })
  }

  const { id: contractId, userId } = params
  const contract = await getContract(contractId)
  if (!contract) {
    res.status(404).json({ error: 'Contract not found' })
    return
  }
  res.setHeader('Cache-Control', marketCacheStrategy)

  // Get single user's positions
  if (userId) {
    try {
      const contractMetrics = await getUserContractMetrics(
        userId,
        contractId,
        db
      )
      return res.status(200).json(contractMetrics)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: 'Error getting user contract metrics' })
    }
  }

  const { top, bottom, order } = params
  if (order && !['profit', 'shares'].includes(order as string)) {
    res.status(400).json({ error: 'Invalid order, must be shares or profit' })
    return
  }

  // Get all positions for contract
  try {
    const contractMetrics = await getContractMetricsForContractId(
      contractId,
      db,
      order ? (order as 'profit' | 'shares') : undefined
    )
    if (!top && !bottom) {
      return res.status(200).json(contractMetrics)
    }

    // Get at most `top + bottom` positions
    let topSlice: ContractMetric[] = []
    let bottomSlice: ContractMetric[] = []
    if (order === 'profit') {
      if (bottom) {
        bottomSlice = contractMetrics.slice(-bottom)
      }
      if (top) {
        topSlice = contractMetrics.slice(0, top)
      }
    } else if (order === 'shares') {
      // Both YES and NO are sorted descending by shares, so we need to
      // find the first NO share index and slice from there
      const noSharesIndex = contractMetrics.findIndex((cm) => cm.hasNoShares)

      if (bottom && noSharesIndex !== -1) {
        bottomSlice = contractMetrics.slice(
          noSharesIndex,
          noSharesIndex + bottom
        )
      }

      if (top) {
        if (noSharesIndex !== -1 && noSharesIndex < top) {
          topSlice = contractMetrics.slice(0, noSharesIndex)
        } else {
          topSlice = contractMetrics.slice(0, top)
        }
      }
    }
    return res
      .status(200)
      .json(uniqBy(topSlice.concat(bottomSlice), (cm) => cm.userId))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error getting contract metrics' })
  }
}
