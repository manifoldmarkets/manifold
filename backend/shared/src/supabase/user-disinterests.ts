import { APIError } from 'common/api/utils'
import { Contract } from 'common/contract'
import {
  applyDisinterestTopicPenalty,
  DISINTEREST_TOPIC_WINDOW_DAYS,
  MAX_NEAR_DUPLICATES_PER_DISINTEREST,
  NEAR_DUPLICATE_CANDIDATE_LIMIT,
  NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
  TopicScores,
} from 'common/disinterests'
import { GROUP_SCORE_PRIOR } from 'common/feed'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

type Db = SupabaseDirectClient | SupabaseTransaction

export type UninterestedResult = {
  uninterested: boolean
  /** Near-identical markets newly hidden alongside this one. */
  hiddenSimilarCount: number
}

/**
 * True for a market the user marked themselves and for one hidden on their
 * behalf as a near-duplicate: either way their feed is hiding it, and either
 * way the undo below brings it back.
 */
export const isContractUninterested = async (
  pg: Db,
  userId: string,
  contractId: string
) => {
  const row = await pg.oneOrNone(
    `select 1 from user_disinterests where user_id = $1 and contract_id = $2`,
    [userId, contractId]
  )
  return row !== null
}

export const setContractUninterested = async (
  pg: SupabaseDirectClient,
  userId: string,
  contractId: string,
  uninterested: boolean
): Promise<UninterestedResult> => {
  if (!uninterested) {
    // Undo takes the mark and every hide derived from it. Hides derived from
    // some other mark stay, as does a market the user marked themselves.
    await pg.none(
      `delete from user_disinterests
       where user_id = $1
         and (contract_id = $2 or source_contract_id = $2)`,
      [userId, contractId]
    )
    return { uninterested: false, hiddenSimilarCount: 0 }
  }

  return await pg.tx(async (tx) => {
    const creatorId = await tx.oneOrNone(
      `select creator_id from contracts where id = $1`,
      [contractId],
      (r: { creator_id: string } | null) => r?.creator_id
    )
    if (!creatorId) throw new APIError(404, 'Market not found')

    // Idempotent: the unique (user_id, contract_id) index makes a repeat click
    // a no-op instead of a duplicate row. A hide the system derived earlier
    // that the user now marks themselves is promoted, so undoing the market it
    // came from no longer takes it along.
    await tx.none(
      `insert into user_disinterests (user_id, contract_id, creator_id)
       values ($1, $2, $3)
       on conflict (user_id, contract_id) do update set source_contract_id = null`,
      [userId, contractId, creatorId]
    )
    const hiddenSimilarCount = await hideNearDuplicatesOfMark(
      tx,
      userId,
      contractId
    )
    return { uninterested: true, hiddenSimilarCount }
  })
}

/**
 * HNSW hands back at most hnsw.ef_search rows (40 in prod), and in a daily
 * series the resolved instances are at least as close as the open ones.
 * set_config(..., is_local => true) scopes the wider search to the calling
 * transaction.
 */
const widenNearestNeighbourSearch = (tx: SupabaseTransaction) =>
  tx.one(`select set_config('hnsw.ef_search', $1, true)`, [
    String(NEAR_DUPLICATE_CANDIDATE_LIMIT),
  ])

/**
 * Hides, for this user, the open markets whose question is near-identical to
 * the one they just marked: the same question for another date, threshold or
 * week. Markets created later are caught by hideNearDuplicatesOfNewContract.
 */
const hideNearDuplicatesOfMark = async (
  tx: SupabaseTransaction,
  userId: string,
  contractId: string
) => {
  await widenNearestNeighbourSearch(tx)
  const hidden = await tx.manyOrNone<{ contract_id: string }>(
    `insert into user_disinterests (user_id, contract_id, creator_id, source_contract_id)
     select $1, picked.id, picked.creator_id, $2
     from (
       select c.id, c.creator_id
       from contract_embeddings src
       join lateral (
         select ce.contract_id, ce.embedding <=> src.embedding as distance
         from contract_embeddings ce
         where ce.contract_id <> src.contract_id
           and 1 - (ce.embedding <=> src.embedding) > $3
         order by ce.embedding <=> src.embedding
         limit $4
       ) near on true
       join contracts c on c.id = near.contract_id
       where src.contract_id = $2
         and c.visibility = 'public'
         and c.deleted = false
         and c.resolution_time is null
         and (c.close_time is null or c.close_time > now())
       order by near.distance
       limit $5
     ) picked
     on conflict (user_id, contract_id) do nothing
     returning contract_id`,
    [
      userId,
      contractId,
      NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
      NEAR_DUPLICATE_CANDIDATE_LIMIT,
      MAX_NEAR_DUPLICATES_PER_DISINTEREST,
    ]
  )
  return hidden.length
}

/**
 * A new market that is near-identical to one a user marked uninterested is
 * hidden for that user as it is created, so a recurring series stays gone
 * after a single mark. Looks the new market's nearest neighbours up in the
 * embedding index and keeps those somebody marked: scanning every marked
 * market instead read the whole embeddings table and took 6.5s cold in prod.
 * The trade-off is that a marked instance further away than the
 * NEAR_DUPLICATE_CANDIDATE_LIMIT nearest neighbours is missed, which takes a
 * very large and very uniform series; the topic penalty covers those.
 */
export const hideNearDuplicatesOfNewContract = async (
  pg: Db,
  contract: Pick<Contract, 'id' | 'creatorId' | 'visibility'>
) => {
  if (contract.visibility !== 'public') return 0
  return await pg.tx(async (tx) => {
    await widenNearestNeighbourSearch(tx)
    const hidden = await tx.manyOrNone<{ user_id: string }>(
      `insert into user_disinterests (user_id, contract_id, creator_id, source_contract_id)
       select distinct on (ud.user_id) ud.user_id, $1, $2, ud.contract_id
       from contract_embeddings new_e
       join lateral (
         select ce.contract_id, ce.embedding <=> new_e.embedding as distance
         from contract_embeddings ce
         where ce.contract_id <> new_e.contract_id
           and 1 - (ce.embedding <=> new_e.embedding) > $3
         order by ce.embedding <=> new_e.embedding
         limit $4
       ) near on true
       join user_disinterests ud on ud.contract_id = near.contract_id
       where new_e.contract_id = $1
         and ud.source_contract_id is null
         and ud.user_id <> $2
       order by ud.user_id, near.distance
       on conflict (user_id, contract_id) do nothing
       returning user_id`,
      [
        contract.id,
        contract.creatorId,
        NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
        NEAR_DUPLICATE_CANDIDATE_LIMIT,
      ]
    )
    return hidden.length
  })
}

/** How many markets the user marked uninterested recently, per topic. */
export const getDisinterestCountsByTopic = async (
  pg: Db,
  userId: string
): Promise<TopicScores> => {
  const rows = await pg.manyOrNone<{ group_id: string; n: number }>(
    `select gc.group_id, count(distinct ud.contract_id)::int as n
     from user_disinterests ud
     join group_contracts gc on gc.contract_id = ud.contract_id
     where ud.user_id = $1
       and ud.source_contract_id is null
       and ud.created_time > now() - make_interval(days => $2)
     group by gc.group_id`,
    [userId, DISINTEREST_TOPIC_WINDOW_DAYS]
  )
  return Object.fromEntries(rows.map((r) => [r.group_id, r.n]))
}

/**
 * The user's topic scores with their recent uninterested marks applied. Reads
 * the marks per request rather than baking them into the interests cache: the
 * cache is per process with no cross-process invalidation, and the point of
 * clicking is that the feed changes now.
 */
export const applyUserDisinterestsToTopicScores = async (
  pg: Db,
  userId: string,
  scores: TopicScores
): Promise<TopicScores> => {
  const counts = await getDisinterestCountsByTopic(pg, userId)
  if (Object.keys(counts).length === 0) return scores
  return applyDisinterestTopicPenalty(scores, counts, GROUP_SCORE_PRIOR)
}
