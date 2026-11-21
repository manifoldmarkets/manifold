import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { api } from '../api/api'
import { ReactionContentTypes, ReactionType } from 'common/reaction'

export const unreact = async (
  contentId: string,
  contentType: ReactionContentTypes,
  reactionType: ReactionType
) => {
  api('react', {
    remove: true,
    contentId,
    contentType,
    reactionType,
  })
}

export async function getLikedContracts(userId: string) {
  // TODO: The best way to do this would be to join the matching table via contentId and type

  const reacts = await run(
    db
      .from('user_reactions')
      .select('reaction_id, content_id, created_time')
      .eq('content_type', 'contract')
      .eq('user_id', userId)
      .order('created_time', { ascending: false })
      .limit(1000)
  )

  const contracts = await run(
    db
      .from('contracts')
      // The perp badge needs the ticker (and the feed id it falls back on);
      // pulled as scalar JSON paths rather than loading every liked
      // contract's full data blob for the sake of a few perps.
      .select(
        'id, question, slug, outcome_type, ticker:data->>ticker, oracle_feed_id:data->>oracleFeedId'
      )
      .in(
        'id',
        reacts.data.map((r) => r.content_id)
      )
  )

  return contracts.data as unknown as LikedContractRow[]
}

export type LikedContractRow = {
  id: string
  question: string | null
  slug: string | null
  outcome_type: string | null
  ticker: string | null
  oracle_feed_id: string | null
}

export async function getLikedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('user_reactions')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('content_type', 'contract')
  )
  return count
}
