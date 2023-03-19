import { z } from 'zod'

import { Contract } from 'common/contract'
import { shuffle } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { authEndpoint, APIError, validate } from './helpers'

const bodySchema = z.object({
  excludedContractIds: z.array(z.string()).optional(),
})

export const getRecommendedContracts = authEndpoint(async (req, auth) => {
  const pg = createSupabaseDirectClient()
  const { excludedContractIds } = validate(bodySchema, req.body)

  const limit = 20

  // Signed in
  const userId = auth.uid
  // Stephen
  // const userId = 'tlmGNz9kjXc2EteizMORes4qvWl2'
  // Sinclair
  // const userId = '0k1suGSJKVUnHbCPEhHNpgZPkUP2'
  // Destiny user (@RR)
  // const userId = 'cic8WCRuqUWmUaTgpG6qLtczBi83'

  const rows = await pg.manyOrNone(
    `with top_trending as (
      select * from user_trending_contract
      where user_id = $1
      limit 100
    ), top_half as (
      select * from top_trending
      order by (1 / distance) * freshness_score desc
      --order by distance
      limit 50
    ), contract_ids as (
      select * from (
        select * from top_half
        order by random()
        limit 20
      ) as rand
      order by (1 / distance) * freshness_score desc
    )
    select data, distance, freshness_score from contract_ids
    join contracts on contracts.id = contract_ids.contract_id
  `,
    [userId]
  )
  console.log('rows', rows.length)
  console.log(
    'distance',
    rows.slice(0, 10).map((r) => [
      r.data.question,
      r.distance,
      r.freshness_score,
      // r.score,
    ])
  )
  const contracts = rows.map(({ data }) => data as Contract)

  return {
    data: contracts,
  }
})
