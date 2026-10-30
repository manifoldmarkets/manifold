import { APIError } from 'common/api/utils'
import { Contract } from 'common/contract'
import {
  applyDisinterestTopicPenalty,
  DISINTEREST_TOPIC_WINDOW_DAYS,
  MAX_NEAR_DUPLICATES_PER_DISINTEREST,
  NEAR_DUPLICATE_CANDIDATE_LIMIT,
  NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
  TopicPenalties,
  topicPenaltiesFromCounts,
  TopicScores,
} from 'common/disinterests'
import { GROUP_SCORE_PRIOR } from 'common/feed'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import {
  from,
  leftJoin,
  limit as lim,
  orderBy,
  renderSql,
  select,
  where,
  withClause,
} from 'shared/supabase/sql-builder'

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
    return await pg.tx(async (tx) => {
      // New-market propagation holds a key-share lock on this mark until its
      // derived hides commit. Take the mark's row lock first and let that
      // wait play out, so the delete below starts from a snapshot that sees
      // those hides. A lone delete would block on the same lock, then skip
      // the rows committed after its snapshot and leave them orphaned.
      await tx.oneOrNone(
        `select contract_id from user_disinterests
         where user_id = $1 and contract_id = $2
         for update`,
        [userId, contractId]
      )
      // Undo takes the mark and every hide derived from it. Hides derived
      // from some other mark stay, as does a market the user marked
      // themselves.
      await tx.none(
        `delete from user_disinterests
         where user_id = $1
           and (contract_id = $2 or source_contract_id = $2)`,
        [userId, contractId]
      )
      return { uninterested: false, hiddenSimilarCount: 0 }
    })
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
    // The source marks are key-share locked, in one fixed order, before any
    // hide is derived from them, and distinct on runs over the locked rows
    // because it cannot lock rows itself. Undo takes the mark's row lock, so
    // whichever side starts second waits: an Undo that waits then sees and
    // removes these hides, and a propagation that waits re-reads a deleted
    // mark as gone and derives nothing from it. Without the lock the two could
    // interleave and leave a hide whose mark no longer exists.
    const hidden = await tx.manyOrNone<{ user_id: string }>(
      `with locked_sources as materialized (
         select ud.user_id, ud.contract_id, near.distance
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
         order by ud.user_id, ud.contract_id
         for key share of ud
       )
       insert into user_disinterests (user_id, contract_id, creator_id, source_contract_id)
       select distinct on (user_id) user_id, $1, $2, contract_id
       from locked_sources
       order by user_id, distance
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

/**
 * The user's recent marks as per-topic multipliers for a query to apply, or
 * undefined when none would change anything.
 */
export const getDisinterestTopicPenalties = async (
  pg: Db,
  userId: string
): Promise<TopicPenalties | undefined> =>
  topicPenaltiesFromCounts(await getDisinterestCountsByTopic(pg, userId))

/**
 * Where clause dropping every market the user has hidden, whether they marked
 * it themselves or it was derived from a mark. For queries over `contracts`.
 */
export const hideUninterestedMarketsSql = (userId: string) =>
  where(
    `not exists (select 1 from user_disinterests ud
       where ud.user_id = $1 and ud.contract_id = contracts.id)`,
    [userId]
  )

/**
 * Re-ranks a bounded window of candidates so markets in topics the user marked
 * uninterested sink below the rest. The cold-start feeds order by a score the
 * importance index serves directly; a penalized order cannot use that index,
 * so the index-ordered top of the list stays the candidate set and only it is
 * re-ranked. A market takes its most penalized topic's multiplier, the same
 * "worst matching tag decides" shape as the personalized niche blend, and
 * ties fall back to the raw score so an unpenalized order is unchanged.
 */
export const rankWithDisinterestPenalty = (opts: {
  /**
   * A complete statement that selects `id` and the score column and is
   * already ordered and limited to the window. Formatted, with no parameters.
   */
  candidatesSql: string
  scoreColumn: 'importance_score' | 'freshness_score'
  penalties: TopicPenalties
  limit: number
  offset: number
}) => {
  const { candidatesSql, scoreColumn, penalties, limit, offset } = opts
  return renderSql(
    withClause(`candidates as ($1:raw)`, [candidatesSql]),
    withClause(
      `penalized as (
        select gc.contract_id, min(p.multiplier) as multiplier
        from unnest($1::text[], $2::float8[]) as p(group_id, multiplier)
        join group_contracts gc on gc.group_id = p.group_id
        where gc.contract_id in (select id from candidates)
        group by gc.contract_id
      )`,
      [penalties.topicIds, penalties.multipliers]
    ),
    select('c.*'),
    from('candidates c'),
    leftJoin('penalized p on p.contract_id = c.id'),
    orderBy(
      `c.${scoreColumn} * coalesce(p.multiplier, 1) desc, c.${scoreColumn} desc, c.id`
    ),
    lim(limit, offset)
  )
}
