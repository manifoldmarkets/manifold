import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient | ITask<any>,
  contractIds: string[]
) {
  if (contractIds.length === 0) return getDefaultEmbedding()

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id in ($1:list)`,
    [contractIds],
    (r: { average_embedding: number[] }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        return getDefaultEmbedding()
      }
      return r.average_embedding
    }
  )
}

export async function getInterestedContractIds(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string
) {
  // Get contract ids that you bet on or liked.
  return await pg.map(
    `select distinct contract_id from contract_bets where data->>'userId' = $1
     union
     select distinct data->>'contentId' as contract_id from user_reactions where user_id = $1 and data->>'type' = 'like' and data->>'contentId' is not null
    `,
    [userId],
    (r: { contract_id: string }) => r.contract_id
  )
}

export function getDefaultEmbedding() {
  return Array<number>(1536).fill(0)
}
