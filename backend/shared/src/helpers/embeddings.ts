import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'
import { sum } from 'lodash'

export function magnitude(vector: number[]): number {
  const vectorSum = sum(vector.map((val) => val * val))
  return Math.sqrt(vectorSum)
}
export function normalize(vector: number[]): number[] {
  const mag = magnitude(vector)
  return vector.map((val) => val / mag)
}

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
  return normalize(JSON.parse(avg.average_embedding) as number[])
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
      const embed = normalize(JSON.parse(r.average_embedding) as number[])
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
  feedId?: number,
  removeContract?: boolean
) {
  await pg.task('update-user-disinterest-embedding', async (pg) => {
    if (removeContract) {
      await pg.none(
        `delete from user_disinterests
                where user_id = $1 and contract_id = $2 and creator_id = $3 and feed_id = $4`,
        [userId, contractId, creatorId, feedId]
      )
    } else
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
      return normalize(JSON.parse(r.average_embedding) as number[])
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
      return normalize(JSON.parse(r.average_embedding) as number[])
    }
  )
}
export async function updateUsersViewEmbeddings(
  pg: SupabaseDirectClient | ITask<any>
) {
  const userToEmbeddingMap: {
    [userId: string]: number[] | null
  } = {}
  await pg.map(
    `
      select
        user_seen_markets.user_id,
        avg(contract_embeddings.embedding) as average_embedding
      from
        contract_embeddings
        join user_seen_markets on user_seen_markets.contract_id = contract_embeddings.contract_id
        join users on users.id = user_seen_markets.user_id
      where
          user_seen_markets.type = 'view market'
      group by
          user_seen_markets.user_id
    `,
    [],
    (r: { user_id: string; average_embedding: string }) => {
      if (r.average_embedding === null) {
        console.error('No average of view embeddings for', r.user_id)
        userToEmbeddingMap[r.user_id] = null
      }
      userToEmbeddingMap[r.user_id] = normalize(
        JSON.parse(r.average_embedding) as number[]
      )
    }
  )
  console.log('userToEmbeddingMap', userToEmbeddingMap)
  // TODO: rename this card_view_embedding to contract_view_embedding
  // -- alter table user_embeddings rename column  card_view_embedding to contract_view_embedding;
  // TODO: insert into user_embeddings (user_id, contract_view_embedding) values ($1, $2)
}
