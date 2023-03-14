import { SupabaseDirectClient } from 'shared/supabase/init'

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient,
  contractIds: string[]
) {
  if (contractIds.length === 0) return getDefaultEmbedding()

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id in ($1:list)`,
    [contractIds],
    (r: { average_embedding: number }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        return getDefaultEmbedding()
      }
      return r.average_embedding
    }
  )
}

export function getDefaultEmbedding() {
  return Array<number>(1536).fill(0)
}
