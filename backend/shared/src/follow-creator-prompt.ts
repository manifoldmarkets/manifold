import {
  FOLLOW_CREATOR_PROMPT_COOLDOWN_MS,
  FOLLOW_CREATOR_PROMPT_ENABLED,
  FollowCreatorPromptResult,
  getFollowCreatorPromptCooldown,
  getNewQuestionNotificationStatus,
  isFollowCreatorPromptCreatorEligible,
  meetsFollowCreatorPromptThreshold,
} from 'common/follow-creator-prompt'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { SupabaseDirectClient } from 'shared/supabase/init'

// The follow-creator prompt's decision and record, for the
// follow-creator-prompt endpoint (backend/api/src/follow-creator-prompt.ts).
// Web calls it after a trade fills, once it is ready to show the prompt. It
// answers whether to show it and, when it says yes, has already recorded the
// prompt in follow_creator_prompts, under a per-user lock, so two devices or
// tabs can't both show one.

type PromptFacts = {
  creator_id: string
  creator_is_bot: boolean
  creator_deleted: boolean
  is_following: boolean
  is_blocked: boolean
  private_user: PrivateUser | null
}

const getPromptFacts = (
  pg: SupabaseDirectClient,
  userId: string,
  contractId: string
) =>
  pg.oneOrNone<PromptFacts>(
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
            ) as is_blocked,
            (select p.data from private_users p where p.id = $1) as private_user
     from contracts c
     join users u on u.id = c.creator_id
     where c.id = $2
       and c.visibility is distinct from 'private'`,
    [userId, contractId]
  )

// Times in ms from the database clock, so every API instance agrees.
const readCooldown = async (
  pg: SupabaseDirectClient,
  userId: string,
  creatorId: string
) => {
  const row = await pg.one<{
    now_ms: number
    last_ms: number | null
    last_creator_ms: number | null
  }>(
    `select floor(extract(epoch from now()) * 1000)::float8 as now_ms,
            floor(extract(epoch from max(prompted_time)) * 1000)::float8 as last_ms,
            floor(extract(epoch from max(prompted_time) filter (where creator_id = $2)) * 1000)::float8 as last_creator_ms
     from follow_creator_prompts
     where user_id = $1`,
    [userId, creatorId]
  )
  return getFollowCreatorPromptCooldown({
    nowMs: Number(row.now_ms),
    lastPromptedAtMs: row.last_ms === null ? null : Number(row.last_ms),
    lastCreatorPromptedAtMs:
      row.last_creator_ms === null ? null : Number(row.last_creator_ms),
  })
}

// Walks the creator's markets (contracts_creator_id) and probes the trader's
// summary metric row for each (unique_user_contract_answer, all three key
// columns). The bet that triggered the call is committed with its metrics, so
// it is already counted. Rows with nothing invested (e.g. an unfilled limit
// order) don't count as a trade.
const countMarketsTraded = async (
  pg: SupabaseDirectClient,
  userId: string,
  creatorId: string
) => {
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
  return Number(markets_traded)
}

/** Thrown when the market doesn't exist (or is a legacy private market). */
export class FollowCreatorPromptMarketNotFound extends Error {}

export const decideFollowCreatorPrompt = async (
  pg: SupabaseDirectClient,
  props: {
    userId: string
    contractId: string
    /**
     * Whether the user has topic scores, so For you uses the personalized
     * ranking with the follow boost. Asked only when the prompt is shown.
     */
    hasTopicInterests: (userId: string) => Promise<boolean>
    enabled?: boolean
  }
): Promise<FollowCreatorPromptResult> => {
  const {
    userId,
    contractId,
    hasTopicInterests,
    enabled = FOLLOW_CREATOR_PROMPT_ENABLED,
  } = props
  const facts = await getPromptFacts(pg, userId, contractId)
  // Legacy private markets get no prompt (and don't reveal their creator).
  if (!facts) throw new FollowCreatorPromptMarketNotFound('Market not found')

  const creatorId = facts.creator_id
  const notShown = (
    eligible: boolean,
    extra: Partial<FollowCreatorPromptResult> = {}
  ): FollowCreatorPromptResult => ({
    creatorId,
    show: false,
    eligible,
    marketsTraded: 0,
    ...extra,
  })
  if (!enabled) return notShown(false)

  const eligible = isFollowCreatorPromptCreatorEligible({
    userId,
    creatorId,
    isFollowing: facts.is_following,
    isBlocked: facts.is_blocked,
    creatorIsBot: facts.creator_is_bot,
    creatorDeleted: facts.creator_deleted,
  })
  if (!eligible) return notShown(false)

  // Cheap check first: right after a prompt, every trade for a day lands here.
  const cooldown = await readCooldown(pg, userId, creatorId)
  if (cooldown.kind === 'creator') return notShown(false)
  if (cooldown.kind === 'user')
    return notShown(true, { nextPromptAt: cooldown.nextPromptAt })

  const marketsTraded = await countMarketsTraded(pg, userId, creatorId)
  if (!meetsFollowCreatorPromptThreshold(marketsTraded))
    return notShown(true, { marketsTraded })

  // Claim: serialize this user's claims, re-check, record.
  const claimed = await pg.tx(async (tx) => {
    await tx.one(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `follow-creator-prompt:${userId}`,
    ])
    const recheck = await readCooldown(tx, userId, creatorId)
    if (recheck.kind !== 'none') return recheck
    const { now_ms } = await tx.one<{ now_ms: number }>(
      `insert into follow_creator_prompts
         (user_id, creator_id, contract_id, markets_traded, prompted_time)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, creator_id) do update
         set contract_id = excluded.contract_id,
             markets_traded = excluded.markets_traded,
             prompted_time = excluded.prompted_time
       returning floor(extract(epoch from prompted_time) * 1000)::float8 as now_ms`,
      [userId, creatorId, contractId, marketsTraded]
    )
    return { kind: 'claimed' as const, nowMs: Number(now_ms) }
  })
  if (claimed.kind === 'creator') return notShown(false, { marketsTraded })
  if (claimed.kind === 'user')
    return notShown(true, {
      marketsTraded,
      nextPromptAt: claimed.nextPromptAt,
    })

  const privateUser = facts.private_user
  const inAppDestinationOn = privateUser
    ? getNotificationDestinationsForUser(
        privateUser,
        'contract_from_followed_user'
      ).sendToBrowser
    : false
  const forYouBoost = await hasTopicInterests(userId).catch(() => false)
  const nextPromptAt = claimed.nowMs + FOLLOW_CREATOR_PROMPT_COOLDOWN_MS
  return {
    creatorId,
    show: true,
    eligible: true,
    marketsTraded,
    nextPromptAt: Number.isFinite(nextPromptAt) ? nextPromptAt : undefined,
    why: {
      newQuestionNotifications: getNewQuestionNotificationStatus(
        creatorId,
        inAppDestinationOn
      ),
      forYouBoost,
    },
  }
}
