import { APIError, type APIHandler } from './helpers'

import { ContractMetric } from 'common/contract-metric'
import {
  getOrderedContractMetricRowsForContractId,
  getUserContractMetrics,
} from 'common/supabase/contract-metrics'
import { uniqBy } from 'lodash'
import { createSupabaseClient } from 'shared/supabase/init'

export const getPositions: APIHandler<'market/:id/positions'> = async (
  props
) => {
  const { id: contractId, userId } = props

  if (contractId === 'U3zLgOZkGUE7cvG98961') {
    throw new APIError(404, `We're done with whales vs minnows, sorry!`)
  }

  const db = createSupabaseClient()

  // Get single user's positions
  if (userId) {
    try {
      const contractMetrics = await getUserContractMetrics(
        userId,
        contractId,
        db
      )
      return contractMetrics
    } catch (e) {
      throw new APIError(500, 'Error getting user contract metrics')
    }
  }

  const { top, bottom, order } = props

  // Get all positions for contract
  const contractMetricRows = await getOrderedContractMetricRowsForContractId(
    contractId,
    db,
    undefined,
    order
  )
  const contractMetrics = contractMetricRows.map(
    (row) => row.data as ContractMetric
  )
  if (!top && !bottom) {
    return contractMetrics
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
      bottomSlice = contractMetrics.slice(noSharesIndex, noSharesIndex + bottom)
    }

    if (top) {
      if (noSharesIndex !== -1 && noSharesIndex < top) {
        topSlice = contractMetrics.slice(0, noSharesIndex)
      } else {
        topSlice = contractMetrics.slice(0, top)
      }
    }
  }

  return uniqBy(topSlice.concat(bottomSlice), (cm) => cm.userId)
}
