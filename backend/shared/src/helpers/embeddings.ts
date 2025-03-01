import { SupabaseDirectClient } from 'shared/supabase/init'
import { ITask } from 'pg-promise'
import { mean, sum, zip } from 'lodash'
import { log } from 'shared/utils'
import { HIDE_FROM_NEW_USER_SLUGS } from 'common/envs/constants'

export const TOPIC_SIMILARITY_THRESHOLD = 0.5

function magnitude(vector: number[]): number {
  const vectorSum = sum(vector.map((val) => val * val))
  return Math.sqrt(vectorSum)
}
function normalize(vector: number[]): number[] {
  const mag = magnitude(vector)
  return vector.map((val) => val / mag)
}

export function normalizeAndAverageVectors(vectors: number[][]): number[] {
  const zipped = zip(...vectors)
  return normalize(zipped.map((vals) => mean(vals)))
}

async function normalizeOrGetDefault(
  pg: SupabaseDirectClient | ITask<any>,
  embedding: string | null
) {
  if (embedding === null) return await getDefaultEmbedding(pg)
  return normalize(JSON.parse(embedding) as number[])
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
                where group_slugs is not null
                and not exists (
                select 1
                from unnest(group_slugs) as t(slug)
                where (slug = any($1) or slug ilike '%manifold%')
                )
              order by importance_score desc
              limit 25
          ) as top_contracts on top_contracts.id = contract_embeddings.contract_id
        ) as subquery
    `,
    [HIDE_FROM_NEW_USER_SLUGS]
  )
  return normalize(JSON.parse(avg.average_embedding) as number[])
}

export async function upsertGroupEmbedding(
  pg: SupabaseDirectClient,
  groupId: string
) {
  const groupContractIds = await pg.map(
    `select contract_id from group_contracts where group_id = $1`,
    [groupId],
    (r: { contract_id: string }) => r.contract_id
  )
  const embed = await getAverageContractEmbedding(pg, groupContractIds)
  if (!embed) return
  await pg.none(
    'insert into group_embeddings (group_id, embedding) values ($1, $2) on conflict (group_id) do update set embedding = $2',
    [groupId, embed]
  )
  log('Upserted group embedding for', groupId)
}

export async function getAverageGroupEmbedding(
  pg: SupabaseDirectClient,
  groupIds: string[] | undefined
) {
  if (!groupIds || groupIds.length === 0) {
    return null
  }
  return await pg.one(
    `select avg(embedding) as average_embedding
            from group_embeddings where group_id = any($1)`,
    [groupIds],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) return null
      return normalize(JSON.parse(r.average_embedding) as number[])
    }
  )
}

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient,
  contractIds: string[] | undefined
) {
  if (!contractIds || contractIds.length === 0) {
    return null
  }

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id = any($1)`,
    [contractIds],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) return null
      return normalize(JSON.parse(r.average_embedding) as number[])
    }
  )
}

export async function addContractToUserDisinterestEmbedding(
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
  })
  await updateUserDisinterestEmbeddingInternal(pg, userId)
}

export async function updateUserDisinterestEmbeddingInternal(
  pg: SupabaseDirectClient,
  userId: string
) {
  const disinterestedContractIds = await getDisinterestedContractIds(pg, userId)
  const disinterestEmbedding = await computeUserDisinterestEmbedding(
    pg,
    userId,
    disinterestedContractIds
  )

  await pg.none(
    'UPDATE user_embeddings SET disinterest_embedding = $2 WHERE user_id = $1',
    [userId, disinterestEmbedding]
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
    async (r: { average_embedding: string }) =>
      normalizeOrGetDefault(pg, r.average_embedding)
  )
}
