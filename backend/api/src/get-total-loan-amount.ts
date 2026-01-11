import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  calculateLoanWithInterest,
} from 'common/loans'
import {
  getUnresolvedContractMetricsContractsAnswers,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import {
  getLoanTrackingRows,
} from 'shared/helpers/user-contract-loans'

export const getTotalLoanAmount: APIHandler<'get-total-loan-amount'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  const now = Date.now()

  // Get all user's contract metrics with loans
  const { metrics } =
    await getUnresolvedContractMetricsContractsAnswers(pg, [user.id])
  
  const metricsWithLoans = metrics.filter((m) => (m.loan ?? 0) > 0)
  
  if (metricsWithLoans.length === 0) {
    return { totalOwed: 0 }
  }

  // Get loan tracking data
  const contractIds = [...new Set(metricsWithLoans.map((m) => m.contractId))]
  const loanTracking = await getLoanTrackingRows(pg, user.id, contractIds)
  const trackingByKey = keyBy(
    loanTracking,
    (t) => `${t.contract_id}-${t.answer_id ?? ''}`
  )

  // Calculate total owed (principal + interest)
  const totalOwed = metricsWithLoans.reduce((sum, metric) => {
    const key = `${metric.contractId}-${metric.answerId ?? ''}`
    const tracking = trackingByKey[key]
    const loanWithInterest = calculateLoanWithInterest(metric, tracking, now)
    return sum + loanWithInterest.total
  }, 0)

  return { totalOwed }
}
