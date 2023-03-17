import { sql } from 'kysely'
import { createKyselyClient } from 'shared/supabase/init'
import { authEndpoint, APIError } from './helpers'

export const getRecommendedContracts = authEndpoint(async (_req, auth) => {
  const kc = createKyselyClient()
  const userId = auth.uid

  const limit = 20

  await kc
    .with('user_embedding', (kc) =>
      kc
        .selectFrom('user_embeddings')
        .select('interest_embedding')
        .where('user_id', '=', userId)
    )
    .with('similar_contract_ids', (kc) =>
      kc
        .selectFrom('contract_embeddings')
        .select([
          'contract_id',
          sql<number>`1 - (contract_embeddings.embedding <=> user_embedding.interest_embedding)`.as(
            'similarity'
          ),
        ])
        .limit(limit)
    )
    .with('similar_contracts', (kc) =>
      kc
        .selectFrom('similar_contract_ids')
        .innerJoin(
          'contracts',
          'contracts.id',
          'similar_contract_ids.contract_id'
        )
        .select('data')
        .where(sql`(data->>isResolved)::boolean`, '=', 'false')
    )

  return {}
})
