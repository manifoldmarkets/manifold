import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  isFollowCreatorPromptCreatorEligible,
  meetsFollowCreatorPromptThreshold,
} from 'common/follow-creator-prompt'

// Web calls this after a trade fills. It answers whether the trader has now
// traded on enough of the market creator's markets, without following them,
// to be offered a Follow button. Read-only.
export const getFollowCreatorPrompt: APIHandler<
  'get-follow-creator-prompt'
> = async ({ contractId }, auth) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  const facts = await pg.oneOrNone<{
    creator_id: string
    creator_is_bot: boolean
    creator_deleted: boolean
    is_following: boolean
    is_blocked: boolean
  }>(
    `select c.creator_id,
            u.is_bot as creator_is_bot,
            coalesce((u.data->>'userDeleted')::boolean, false) as creator_deleted,
            exists (
              select 1 from user_follows f
              where f.user_id = $1 and f.follow_id = c.creator_id
            ) as is_following,
            exists (
              select 1 from private_users p
              where p.id = $1
                and (coalesce(p.data->'blockedUserIds', '[]'::jsonb) ? c.creator_id
                  or coalesce(p.data->'blockedByUserIds', '[]'::jsonb) ? c.creator_id)
            ) as is_blocked
     from contracts c
     join users u on u.id = c.creator_id
     where c.id = $2
       and c.visibility is distinct from 'private'`,
    [userId, contractId]
  )
  // Legacy private markets get no prompt (and don't reveal their creator).
  if (!facts) throw new APIError(404, 'Market not found')

  const creatorId = facts.creator_id
  const eligible = isFollowCreatorPromptCreatorEligible({
    userId,
    creatorId,
    isFollowing: facts.is_following,
    isBlocked: facts.is_blocked,
    creatorIsBot: facts.creator_is_bot,
    creatorDeleted: facts.creator_deleted,
  })
  if (!eligible) {
    return { creatorId, show: false, eligible, marketsTraded: 0 }
  }

  // Walks the creator's markets (contracts_creator_id) and probes the trader's
  // summary metric row for each (unique_user_contract_answer, all three key
  // columns). The bet that triggered this call is committed with its metrics,
  // so it is already counted. Rows with nothing invested (e.g. an unfilled
  // limit order) don't count as a trade.
  const { markets_traded } = await pg.one<{ markets_traded: number }>(
    `select count(*)::int as markets_traded
     from contracts c
     join user_contract_metrics m
       on m.user_id = $1
      and m.contract_id = c.id
      and coalesce(m.answer_id, '') = ''
     where c.creator_id = $2
       and coalesce((m.data->>'totalAmountInvested')::numeric, 0) > 0`,
    [userId, creatorId]
  )

  return {
    creatorId,
    show: meetsFollowCreatorPromptThreshold(markets_traded),
    eligible,
    marketsTraded: markets_traded,
  }
}
