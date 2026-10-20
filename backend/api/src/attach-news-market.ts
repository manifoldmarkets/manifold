import { isEligibleRelatedMarket } from 'common/related-markets'
import { fetchContracts, stripContract } from 'shared/news-feed/pipeline'
import {
  attachNewsMarket,
  getNewsFeedBuild,
  isNewsFeedEnabled,
} from 'shared/news-feed/state'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

/**
 * A reader links an existing market to a story: as the direct test of one of
 * its claims (shown beside the quote), or as a related forecast (shown under
 * the outlook). Used when drafting a market turns up one that already asks
 * the question. Curation, so it takes the same ban as adding a topic.
 */
export const attachNewsMarketHandler: APIHandler<'attach-news-market'> =
  onlyUsersWhoCanPerformAction('addTopic', async (props, auth) => {
    if (!isNewsFeedEnabled()) {
      throw new APIError(400, 'The news feed is not enabled on this server.')
    }
    const { storyId, claimId, contractId, relation } = props
    const story = getNewsFeedBuild()?.stories.find((s) => s.id === storyId)
    if (!story) throw new APIError(404, 'That story is not in the feed.')
    if (relation === 'direct' && !claimId) {
      throw new APIError(400, 'A direct match needs the claim it tests.')
    }
    if (claimId && !story.claims?.some((c) => c.id === claimId)) {
      throw new APIError(404, 'That claim is not on this story.')
    }
    const pg = createSupabaseDirectClient()
    const [contract] = await fetchContracts(pg, [contractId])
    if (!contract || !isEligibleRelatedMarket(contract)) {
      throw new APIError(404, 'That market is not open to link.')
    }
    attachNewsMarket(
      { storyId, claimId, contractId, relation, userId: auth.uid },
      stripContract(contract)
    )
    return { ok: true }
  })
