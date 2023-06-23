import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'
import { log } from 'shared/utils'

export async function getDefaultEmbedding(
  pg: SupabaseDirectClient | ITask<any>
) {
  const avg = await pg.one<{ average_embedding: string }>(
    `
        WITH ignore_embeddings AS (
            SELECT AVG(embedding) AS average_ignore
            FROM topic_embeddings
            WHERE topic IN (
                SELECT UNNEST(ARRAY['destiny.gg', 'stock', 'planecrash', 'proofnik', 'permanent', 'personal']::text[])
            )
        ),
       popular_avg AS (
           SELECT AVG(embedding) AS average_contract
           FROM (
              SELECT contract_embeddings.embedding
              FROM contract_embeddings
                       JOIN (
                  SELECT id
                  FROM contracts
                  ORDER BY popularity_score DESC
                  LIMIT 100
              ) AS top_contracts ON top_contracts.id = contract_embeddings.contract_id
            ) AS subquery
       )
        SELECT (popular_avg.average_contract - ignore_embeddings.average_ignore) AS average_embedding
        FROM popular_avg, ignore_embeddings;
    `
  )
  return JSON.parse(avg.average_embedding) as number[]
}

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient,
  contractIds: string[] | undefined
) {
  if (!contractIds || contractIds.length === 0) {
    const embed = await getDefaultEmbedding(pg)
    return { embed, defaultEmbed: true }
  }

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id = any($1)`,
    [contractIds],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        const embed = await getDefaultEmbedding(pg)
        return { embed, defaultEmbed: true }
      }
      const embed = JSON.parse(r.average_embedding) as number[]
      return { embed, defaultEmbed: false }
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
    )

    await pg.none(
      'insert into user_embeddings (user_id, interest_embedding) values ($1, $2) on conflict (user_id) do update set interest_embedding = $2',
      [userId, interestEmbedding]
    )
  })
}
export async function updateUserDisinterestEmbeddingInternal(
  pg: SupabaseDirectClient,
  userId: string,
  contractId: string,
  creatorId: string,
  feedId?: number
) {
  await pg.task('update-user-disinterest-embedding', async (pg) => {
    await pg.none(
      `insert into user_disinterests (user_id, contract_id, creator_id, feed_id)
              values ($1, $2, $3, $4)`,
      [userId, contractId, creatorId, feedId]
    )
    const disinterestedContractIds = await getDisinterestedContractIds(
      pg,
      userId
    )
    const disinterestEmbedding = await computeUserDisinterestEmbedding(
      pg,
      userId,
      disinterestedContractIds
    )
    if (disinterestEmbedding === null) {
      log('No disinterest embedding for', userId)
      return
    }

    await pg.none(
      'UPDATE user_embeddings SET disinterest_embedding = $2 WHERE user_id = $1',
      [userId, disinterestEmbedding]
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
async function getDisinterestedContractIds(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string
) {
  // Get contract ids that you bet on or liked.
  return await pg.map(
    `select contract_id from 
      user_disinterests
      where user_id = $1
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
      -- Append user's pre-signup interest embeddings once to be averaged in.
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
async function computeUserDisinterestEmbedding(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string,
  contractIds: string[]
) {
  return await pg.one(
    `
      select avg(embedding) as average_embedding
      from contract_embeddings
      where contract_id = any($1)
    `,
    [contractIds, userId],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) {
        console.error('No average of embeddings for', contractIds)
        return null
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
