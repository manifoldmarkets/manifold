import { z } from 'zod'

import { Contract } from 'common/contract'
import { PlainTablesAndViews } from 'common/supabase/utils'
import { sql, AnySelectQueryBuilder } from 'kysely'
import { shuffle } from 'lodash'
import { createKyselyClient, KyselyQuery } from 'shared/supabase/init'
import { authEndpoint, APIError, validate } from './helpers'

const bodySchema = z.object({
  excludedContractIds: z.array(z.string()).optional(),
})

export const getRecommendedContracts = authEndpoint(async (req, auth) => {
  const kc = createKyselyClient()
  const { excludedContractIds } = validate(bodySchema, req.body)

  const limit = 20

  // Signed in
  // const userId = auth.uid
  // Stephen
  // const userId = 'tlmGNz9kjXc2EteizMORes4qvWl2'
  // Sinclair
  const userId = '0k1suGSJKVUnHbCPEhHNpgZPkUP2'
  const rows = await kc
    .with('user_embedding', (q) =>
      q
        .selectFrom('user_embeddings')
        .where('user_id', '=', userId)
        .select('interest_embedding')
    )
    .with('contract_ids_by_distance', (q) =>
      q
        .selectFrom('contract_embeddings')
        .select([
          'contract_id',
          sql<number>`contract_embeddings.embedding <=> (select interest_embedding from user_embedding)`.as(
            'distance'
          ),
        ])
    )
    .selectFrom('contract_ids_by_distance')
    .innerJoin(
      'public_open_contracts',
      'public_open_contracts.id',
      'contract_ids_by_distance.contract_id'
    )
    .innerJoin(
      'contract_recommendation_features',
      'contract_recommendation_features.contract_id',
      'contract_ids_by_distance.contract_id'
    )
    .select(['data', 'distance', 'freshness_score'])
    .where('distance', '<', 0.14)
    .where('freshness_score', '>', -1)
    // .select(sql`coalesce((1 / distance) * freshness_score, 0)`.as('score'))
    .orderBy('freshness_score', 'desc')
    .limit(limit)
    .execute()
    

  console.log('rows', rows.length)
  console.log(
    'distance',
    rows.slice(0, 10).map((r) => [
      (r.data as Contract).question,
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
