import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'

export async function getDefaultEmbedding(
  pg: SupabaseDirectClient | ITask<any>
) {
  const avg = await pg.one<{ average_embedding: string }>(
    `
    select avg(embedding) as average_embedding
    from (
       select contract_embeddings.embedding
       from contract_embeddings
                join (
           select id
           from contracts
           order by popularity_score desc
           limit 100
       ) as top_contracts on top_contracts.id = contract_embeddings.contract_id
   ) as subquery
    `
  )
  return JSON.parse(avg.average_embedding) as number[]
}

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient,
  contractIds: string[]
) {
  if (contractIds.length === 0) return await getDefaultEmbedding(pg)

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id = any($1)`,
    [contractIds],
    async (r: { average_embedding: number[] }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        return await getDefaultEmbedding(pg)
      }
      return r.average_embedding
    }
  )
}

export async function updateUserInterestEmbedding(
  pg: SupabaseDirectClient,
  userId: string
) {
  await pg.task('update-user-embedding', async (pg) => {
    const interestedContractIds = await getInterestedContractIds(pg, userId)
    const interestEmbedding = await computeUserInterestEmbedding(
      pg,
      userId,
      interestedContractIds
    ).then(async (v) =>
      v.every((n) => n === 0) ? await getDefaultEmbedding(pg) : v
    )

    await pg.none(
      'insert into user_embeddings (user_id, interest_embedding) values ($1, $2) on conflict (user_id) do update set interest_embedding = $2',
      [userId, interestEmbedding]
    )
  })
}

async function getInterestedContractIds(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string
) {
  // Get contract ids that you bet on or liked.
  return await pg.map(
    `select contract_id from (
      select contract_id, max(created_time) as created_time from contract_bets
      where user_id = $1
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

async function computeUserInterestEmbedding(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string,
  contractIds: string[]
) {
  return await pg.one(
    `with combined_embeddings as (
      select embedding as combined_embedding
      from contract_embeddings
      where contract_id = any($1)
      union all
      -- Append user's topic embeddings twice to be averaged in.
      select topic_embedding as combined_embedding
      from user_topics
      where user_id = $2
      union all
      select topic_embedding as combined_embedding
      from user_topics
      where user_id = $2
      union all
      -- Append user's pre-signup interest embeddings twice to be averaged in.
      select pre_signup_interest_embedding as combined_embedding
      from user_embeddings
      where user_id = $2
      union all
      select pre_signup_interest_embedding as combined_embedding
      from user_embeddings
      where user_id = $2
     )
    select avg(combined_embedding) as average_embedding
    from combined_embeddings`,
    [contractIds, userId],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        return await getDefaultEmbedding(pg)
      }
      return JSON.parse(r.average_embedding) as number[]
    }
  )
}

export async function updateUsersCardViewEmbeddings(
  pg: SupabaseDirectClient | ITask<any>
) {
  return await pg.none(
    `with view_embedding as (
      select
        user_seen_markets.user_id,
        avg(contract_embeddings.embedding) as average_embedding
      from
        contract_embeddings
        join user_seen_markets on user_seen_markets.contract_id = contract_embeddings.contract_id
        join users on users.id = user_seen_markets.user_id
      where
          user_seen_markets.type = 'view market card'
      group by
          user_seen_markets.user_id
    )
    update
      user_embeddings
    set
      card_view_embedding = view_embedding.average_embedding
    from
      view_embedding
    where
      user_embeddings.user_id = view_embedding.user_id`
  )
}
