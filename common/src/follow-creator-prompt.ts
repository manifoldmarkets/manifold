// After a trade, web asks the API whether to suggest following the market's
// creator: the trader has now traded on several of that creator's markets but
// doesn't follow them, so they miss the creator's new markets. Following feeds
// the existing pipelines (new-market notifications, the For You follow boost).
// API: backend/api/src/get-follow-creator-prompt.ts. UI:
// web/components/bet/follow-creator-prompt.tsx.

/** Distinct markets by one creator a user must have traded on to be prompted. */
export const FOLLOW_CREATOR_PROMPT_MIN_MARKETS = 3

/**
 * Official accounts that post hundreds of markets a month. Followers get an
 * in-app notification per new market, so never suggest following these.
 */
export const FOLLOW_CREATOR_PROMPT_EXCLUDED_CREATOR_IDS: readonly string[] = [
  'vuI5upWB8yU00rP7yxj95J2zd952', // Manifold Politics
  'NnVY8olowYMYQGr346dfmHXBSpx2', // Manifold Sports (prod)
  't3R3HV2QFTRGnJxtxhzdesA4stw1', // Manifold Sports (dev)
  '8lZo8X5lewh4hnCoreI7iSc0GxK2', // Manifold AI
  'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // Manifold
]

export const FOLLOW_CREATOR_PROMPT_SHOWN_EVENT = 'follow creator prompt shown'
export const FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT = 'follow creator prompt follow'
export const FOLLOW_CREATOR_PROMPT_DISMISS_EVENT =
  'follow creator prompt dismiss'

export type FollowCreatorPromptResult = {
  creatorId: string
  /** Whether to show the prompt for this creator now. */
  show: boolean
  /**
   * False when the caller already follows or has blocked the creator (or is
   * blocked by them), or the creator is the caller, a bot, deleted or an
   * official account. Ineligible creators can be
   * skipped for the rest of the session; eligible ones may cross the
   * threshold on a later trade.
   */
  eligible: boolean
  /**
   * Distinct markets by the creator the caller has traded on (positive amount
   * invested). Only counted when the creator is eligible; otherwise 0.
   */
  marketsTraded: number
}

/** Cheap pre-check the client runs before asking the API. */
export const mayPromptToFollowCreator = (userId: string, creatorId: string) =>
  !!userId &&
  !!creatorId &&
  userId !== creatorId &&
  !FOLLOW_CREATOR_PROMPT_EXCLUDED_CREATOR_IDS.includes(creatorId)

export const isFollowCreatorPromptCreatorEligible = (facts: {
  userId: string
  creatorId: string
  isFollowing: boolean
  /** Either side has blocked the other. */
  isBlocked: boolean
  creatorIsBot: boolean
  creatorDeleted: boolean
}) =>
  mayPromptToFollowCreator(facts.userId, facts.creatorId) &&
  !facts.isFollowing &&
  !facts.isBlocked &&
  !facts.creatorIsBot &&
  !facts.creatorDeleted

export const meetsFollowCreatorPromptThreshold = (marketsTraded: number) =>
  Number.isFinite(marketsTraded) &&
  marketsTraded >= FOLLOW_CREATOR_PROMPT_MIN_MARKETS

// The web client remembers, per user, which creators it has already prompted
// for, so each creator is suggested at most once. Bounded so the stored list
// can't grow without limit; the oldest entries drop first.
export const MAX_REMEMBERED_PROMPTED_CREATORS = 500

export const parsePromptedCreatorIds = (
  raw: string | null | undefined
): string[] => {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export const addPromptedCreatorId = (
  ids: readonly string[],
  creatorId: string,
  max = MAX_REMEMBERED_PROMPTED_CREATORS
): string[] => {
  const next = [...ids.filter((id) => id !== creatorId), creatorId]
  return max > 0 ? next.slice(-max) : []
}
