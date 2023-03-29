import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'

export function getDefaultEmbedding() {
  return Array<number>(1536).fill(0)
}

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
    `select contract_id from (
      select contract_id, max((data->>'createdTime')::bigint) as created_time from contract_bets
      where data->>'userId' = $1
      group by contract_id
      order by 2
      limit 1000
     ) as bet_on_contract_ids
     union
     select distinct data->>'contentId' as contract_id from user_reactions
     where user_id = $1 and data->>'type' = 'like' and data->>'contentId' is not null
     limit 1000
    `,
    [userId],
    (r: { contract_id: string }) => r.contract_id
  )
}

export async function updateUserInterestEmbedding(
  pg: SupabaseDirectClient,
  userId: string
) {
  await pg.task('update-user-embedding', async (pg) => {
    // TODO: load user_topics embedding and average them with interest embedding
    const interestedContractIds = await getInterestedContractIds(pg, userId)
    const interestEmbedding = await getAverageContractEmbedding(
      pg,
      interestedContractIds
    )
    await pg.none(
      'insert into user_embeddings (user_id, interest_embedding) values ($1, $2) on conflict (user_id) do update set interest_embedding = $2',
      [userId, interestEmbedding]
    )
  })
}
