import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { uniqBy } from 'lodash'
import { log, contractColumnsToSelect } from 'shared/utils'
import { buildUserInterestsCache } from 'shared/topic-interests'

const contractCols = contractColumnsToSelect
  .split(',')
  .map((col) => `c.${col.trim()}`)
  .join(', ')

type FeedItem = {
  contract: Contract
  reason: string
}

export const getEmbeddingFeed: APIHandler<'get-embedding-feed'> = async (
  props,
  auth
) => {
  const { limit, offset, ignoreContractIds } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()
  const startTime = Date.now()

  // Build topic interests cache in background (non-blocking)
  buildUserInterestsCache([userId]).catch((e) =>
    log('Error building user interests cache for embedding feed:', e)
  )

  const ignoreFilter =
    ignoreContractIds && ignoreContractIds.length > 0
      ? `AND c.id <> ALL($4::text[])`
      : ''

  // Main feed: pre-computed embedding candidates, ranked by blended score
  const mainItems: FeedItem[] = await pg
    .map(
      `
    SELECT ${contractCols}, uef.similarity_score
    FROM user_embedding_feed_candidates uef
    JOIN contracts c ON c.id = uef.contract_id
    WHERE uef.user_id = $1
      AND c.close_time > now()
      AND c.visibility = 'public'
      AND c.resolution IS NULL
      AND c.outcome_type NOT IN ('STONK', 'BOUNTIED_QUESTION')
      AND c.unique_bettor_count > 1
      AND NOT EXISTS (
        SELECT 1 FROM user_contract_views
        WHERE user_id = $1 AND contract_id = c.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM user_disinterests
        WHERE user_id = $1 AND contract_id = c.id
      )
      ${ignoreFilter}
    ORDER BY
      c.conversion_score
      * c.freshness_score
      * (0.7 + 0.3 * uef.similarity_score)
      DESC
    LIMIT $2 OFFSET $3
    `,
      ignoreContractIds && ignoreContractIds.length > 0
        ? [userId, limit, offset, ignoreContractIds]
        : [userId, limit, offset],
      (r) => ({
        contract: convertContract(r),
        reason: 'embedding',
      })
    )
    .catch((e) => {
      log('Embedding feed query failed (table may not exist):', e.message)
      return [] as FeedItem[]
    })

  // New-creator discovery: 2 markets from creators < 90 days old with good conversion
  const mainIds = mainItems.map((item) => item.contract.id)
  const discoveryItems: FeedItem[] = await pg
    .map(
      `
    SELECT ${contractCols}
    FROM contracts c
    JOIN users u ON c.creator_id = u.id
    WHERE u.created_time > now() - interval '90 days'
      AND c.close_time > now()
      AND c.visibility = 'public'
      AND c.resolution IS NULL
      AND c.outcome_type NOT IN ('STONK', 'BOUNTIED_QUESTION')
      AND c.unique_bettor_count BETWEEN 1 AND 15
      AND c.conversion_score > 0.15
      AND c.id <> ALL($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM user_contract_views
        WHERE user_id = $2 AND contract_id = c.id
      )
    ORDER BY c.conversion_score * c.freshness_score DESC
    LIMIT 2
    `,
      [mainIds.length > 0 ? mainIds : [''], userId],
      (r) => ({
        contract: convertContract(r),
        reason: 'new_creator',
      })
    )
    .catch((e) => {
      log('Error fetching discovery contracts:', e)
      return [] as FeedItem[]
    })

  // Interleave discovery at positions 5 and 15
  const allItems = [...mainItems]
  if (discoveryItems.length > 0 && offset === 0) {
    const pos1 = Math.min(5, allItems.length)
    allItems.splice(pos1, 0, discoveryItems[0])
    if (discoveryItems.length > 1) {
      const pos2 = Math.min(15, allItems.length)
      allItems.splice(pos2, 0, discoveryItems[1])
    }
  }

  const dedupedItems = uniqBy(allItems, (item) => item.contract.id)

  // No fallback — if no pre-computed candidates, return empty
  if (dedupedItems.length === 0) {
    log('embedding feed: no candidates found for user', userId)
    return { contracts: [], idsToReason: {} }
  }

  const idsToReason: Record<string, string> = {}
  for (const item of dedupedItems) {
    idsToReason[item.contract.id] = item.reason
  }

  log(
    'embedding feed in (s):',
    (Date.now() - startTime) / 1000,
    `(${dedupedItems.length} items, ${discoveryItems.length} discovery)`
  )

  return {
    contracts: dedupedItems.map((item) => item.contract),
    idsToReason,
  }
}
