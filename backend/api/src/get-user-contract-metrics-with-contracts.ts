import { z } from 'zod'
import { MaybeAuthedEndpoint, validate } from './helpers'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Dictionary, flatMap } from 'lodash'
import { ContractMetric } from 'common/contract-metric'
import { Contract } from 'common/contract'

const bodySchema = z.object({
  userId: z.string(),
  limit: z.number(),
})

export const getusercontractmetricswithcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    const { userId, limit } = validate(bodySchema, req.body)
    const visibilitySQL = getContractPrivacyWhereSQLFilter(auth?.uid)
    const cmSql = `ucm.user_id='${userId}' and ucm.data->'lastBetTime' is not null`
    const pg = createSupabaseDirectClient()
    const metricsByContract = {} as Dictionary<ContractMetric>
    const contracts = [] as Contract[]
    try {
      const q = `select ucm.contract_id,
      ucm.data as metrics,
        c.data as contract
    from user_contract_metrics as ucm
        join contracts_rbac as c on c.id = ucm.contract_id
    where ${visibilitySQL} and ${cmSql}
    order by ((ucm.data)->'lastBetTime')::bigint desc offset $1
    limit $2`
      await pg.map(
        q,
        [0, limit],
        (data: {
          contract_id: string
          metrics: ContractMetric
          contract: Contract
        }) => {
          metricsByContract[data.contract_id] = data.metrics as ContractMetric
          contracts.push(data.contract as Contract)
        }
      )
      return { status: 'success', data: { metricsByContract, contracts } }
    } catch (error) {
      return { status: 'failure', data: error }
    }
  }
)
