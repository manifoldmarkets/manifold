import { z } from 'zod'
import { MaybeAuthedEndpoint, validate } from './helpers/endpoint'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { mapValues } from 'lodash'

const bodySchema = z
  .object({
    userId: z.string(),
    limit: z.number(),
    offset: z.number().gte(0).optional(),
  })
  .strict()

export const getusercontractmetricswithcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    const { userId, limit, offset = 0 } = validate(bodySchema, req.body)
    const visibilitySQL = getContractPrivacyWhereSQLFilter(
      auth?.uid,
      undefined,
      'c.id'
    )
    const pg = createSupabaseDirectClient()
    const q = `
        SELECT 
          c.data as contract,
          jsonb_agg(ucm.data) as metrics
        FROM contracts c
        JOIN user_contract_metrics ucm ON c.id = ucm.contract_id
        WHERE ${visibilitySQL}
          AND ucm.user_id = $1
          and case when c.mechanism = 'cpmm-multi-1' then ucm.answer_id is not null else true end
        GROUP BY c.id, c.data
        ORDER BY max((ucm.data->>'lastBetTime')::bigint) DESC
        OFFSET $2 LIMIT $3
      `
    const results = await pg.map(
      q,
      [userId, offset, limit],
      (row) => row as { contract: Contract; metrics: ContractMetric[] }
    )

    const { metricsByContract: allMetrics } =
      calculateUpdatedMetricsForContracts(results)
    const metricsByContract = mapValues(allMetrics, (metrics) =>
      metrics.find((m) => m.answerId === null)
    )

    return {
      metricsByContract,
      contracts: results.map((r) => r.contract),
    }
  }
)
