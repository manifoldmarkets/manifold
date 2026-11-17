// After a trade, web asks the API whether to suggest following the market's
// creator: the trader has now traded on several of that creator's markets but
// doesn't follow them. The API decides and records the prompt atomically, so
// one account sees it at most once a day, and at most once per creator every
// 30 days, across devices.
// API: backend/api/src/follow-creator-prompt.ts (SQL in
// backend/shared/src/follow-creator-prompt.ts). Table: follow_creator_prompts.
// UI: web/components/bet/follow-creator-prompt.tsx.

import { TRADED_TERM } from './envs/constants'
import {
  NEW_QUESTION_DIGEST_ENABLED,
  NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY,
} from './new-question-notifications'

/** Kill switch. Off: web never asks, and the API never says to show. */
export const FOLLOW_CREATOR_PROMPT_ENABLED = true

/** Distinct markets by one creator a user must have traded on to be prompted. */
export const FOLLOW_CREATOR_PROMPT_MIN_MARKETS = 3

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Minimum gap between two prompts (for any creators) to one user. Some
 * traders qualify for dozens of creators at once (prod, Nov 2026: p90 8,
 * max 92), so without a gap they could see several prompts in one session.
 */
export const FOLLOW_CREATOR_PROMPT_COOLDOWN_MS = 24 * HOUR_MS

/** How long before the same creator can be suggested to the same user again. */
export const FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_DAYS = 30
export const FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_MS =
  FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_DAYS * DAY_MS

/**
 * Creators whose new markets never notify their followers, so the prompt
 * makes no notification claim for them. @ManifoldSports creates its markets
 * from the sports cron and the admin sports tool, both with
 * `notifyFollowers: false` (backend/shared/src/sports-markets.ts,
 * runSportsMarketPostCreate): batch creation would otherwise storm followers.
 * Prod, Nov 2026: 459 markets, 0 follower notifications. Whether to turn
 * those notifications on (now capped by the daily digest) is an open product
 * decision; if they are turned on, remove the ids here.
 * Same ids as MANIFOLD_SPORTS_USER_IDS in common/src/sports.ts.
 */
export const CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS: readonly string[] = [
  'NnVY8olowYMYQGr346dfmHXBSpx2', // @ManifoldSports (prod)
  't3R3HV2QFTRGnJxtxhzdesA4stw1', // @ManifoldSports (dev)
]

export const FOLLOW_CREATOR_PROMPT_SHOWN_EVENT = 'follow creator prompt shown'
export const FOLLOW_CREATOR_PROMPT_FOLLOW_EVENT = 'follow creator prompt follow'
export const FOLLOW_CREATOR_PROMPT_DISMISS_EVENT =
  'follow creator prompt dismiss'
export const FOLLOW_CREATOR_PROMPT_WHY_EVENT = 'follow creator prompt why'

/**
 * What following this creator would do for this user, for the copy.
 * - 'on': the creator's new markets notify followers and the user's in-app
 *   destination for them is on.
 * - 'in_app_off': the user turned that in-app notification off.
 * - 'none': the creator's markets don't notify followers at all.
 */
export type NewQuestionNotificationStatus = 'on' | 'in_app_off' | 'none'

export type FollowCreatorPromptWhy = {
  newQuestionNotifications: NewQuestionNotificationStatus
  /**
   * The user's For you ranking is personalized (they have topic scores), so
   * it carries the follow boost in getForYouSQL.
   */
  forYouBoost: boolean
}

export type FollowCreatorPromptResult = {
  creatorId: string
  /** Show the prompt now. Already recorded server-side when true. */
  show: boolean
  /**
   * False when the caller can't be prompted about this creator now: they
   * follow or have blocked the creator (or are blocked by them), the creator
   * is the caller, a bot or deleted, or the caller was prompted about this
   * creator in the last 30 days. The client skips the creator for the rest
   * of the session; eligible ones may cross the threshold on a later trade.
   */
  eligible: boolean
  /**
   * Distinct markets by the creator the caller has traded on (positive amount
   * invested). 0 unless it was counted.
   */
  marketsTraded: number
  /**
   * When the 24 h gap since the caller's last prompt ends (ms). Set when
   * `show` is true, and when the gap is what stopped it.
   */
  nextPromptAt?: number
  /** Set when `show` is true. */
  why?: FollowCreatorPromptWhy
}

/** Cheap pre-check the client runs before asking the API. */
export const mayPromptToFollowCreator = (userId: string, creatorId: string) =>
  FOLLOW_CREATOR_PROMPT_ENABLED &&
  !!userId &&
  !!creatorId &&
  userId !== creatorId

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

export const creatorNotifiesFollowersOfNewQuestions = (creatorId: string) =>
  !CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS.includes(creatorId)

export const getNewQuestionNotificationStatus = (
  creatorId: string,
  inAppDestinationOn: boolean
): NewQuestionNotificationStatus =>
  !creatorNotifiesFollowersOfNewQuestions(creatorId)
    ? 'none'
    : inAppDestinationOn
    ? 'on'
    : 'in_app_off'

export type FollowCreatorPromptCooldown =
  | { kind: 'none' }
  /** Prompted about this creator within FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_MS. */
  | { kind: 'creator' }
  /** Prompted about any creator within FOLLOW_CREATOR_PROMPT_COOLDOWN_MS. */
  | { kind: 'user'; nextPromptAt?: number }

// True unless `thenMs` is known to be at least `windowMs` before `nowMs`.
// A missing timestamp means no prompt yet; a non-finite or future one (bad
// data, clock change) counts as recent, so it never lets an extra prompt out.
const isWithin = (
  nowMs: number,
  thenMs: number | null | undefined,
  windowMs: number
) => thenMs !== null && thenMs !== undefined && !(nowMs - thenMs >= windowMs)

/**
 * Times come from the database clock (backend/shared/src/follow-creator-prompt.ts).
 * `lastPromptedAtMs` is the caller's latest prompt for any creator;
 * `lastCreatorPromptedAtMs` the latest for this creator.
 */
export const getFollowCreatorPromptCooldown = (times: {
  nowMs: number
  lastPromptedAtMs: number | null | undefined
  lastCreatorPromptedAtMs: number | null | undefined
}): FollowCreatorPromptCooldown => {
  const { nowMs, lastPromptedAtMs, lastCreatorPromptedAtMs } = times
  const now = Number.isFinite(nowMs) ? nowMs : NaN
  if (
    isWithin(
      now,
      lastCreatorPromptedAtMs,
      FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_MS
    )
  )
    return { kind: 'creator' }
  // With no readable clock, hold off rather than risk a second prompt.
  if (!Number.isFinite(now)) return { kind: 'user' }
  if (isWithin(now, lastPromptedAtMs, FOLLOW_CREATOR_PROMPT_COOLDOWN_MS)) {
    const nextPromptAt =
      Number(lastPromptedAtMs) + FOLLOW_CREATOR_PROMPT_COOLDOWN_MS
    return Number.isFinite(nextPromptAt)
      ? { kind: 'user', nextPromptAt }
      : { kind: 'user' }
  }
  return { kind: 'none' }
}

// localStorage hint, per user: skip asking the API until the 24 h gap the
// server reported has passed. Only a hint; the server decides.
export const FOLLOW_CREATOR_PROMPT_STORAGE_PREFIX = 'follow-creator-prompt:'
export const followCreatorPromptNextAtKey = (userId: string) =>
  `${FOLLOW_CREATOR_PROMPT_STORAGE_PREFIX}next-at:${userId}`

export const parseFollowCreatorPromptNextAt = (
  raw: string | null | undefined
): number | undefined => {
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export type FollowCreatorPromptCopy = {
  /** First line of the toast. */
  summary: string
  /** Second line of the toast, before following. */
  action: string
  /** Second line of the toast, after following. */
  followed: string
  whyTitle: string
  whyReason: string
  /** "Following X:" above the bullets; absent when there are no bullets. */
  whyLead?: string
  whyBullets: string[]
  whyFooter: string
}

/**
 * Every string the prompt shows. Each claim is checked against the code:
 * - "traded on N": markets where the caller's summary metric has
 *   totalAmountInvested > 0, which counts purchases and never drops on a
 *   sale (common/src/calculate-metrics.ts).
 * - "new-question notifications": following adds the caller to the
 *   recipients in createNewContractNotification. Worded as a subscription,
 *   not "every new question": markets published after creation don't notify.
 * - the daily limit: NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY.
 * - "ranking boost": getForYouSQL multiplies the score of followed creators'
 *   markets by 1.2 (backend/shared/src/supabase/search-contracts.ts); only
 *   for callers with topic scores, hence `forYouBoost`.
 * - "again for 30 days": the server's per-creator rule.
 */
export const getFollowCreatorPromptCopy = (props: {
  creatorName: string
  marketsTraded: number
  why: FollowCreatorPromptWhy
  digestEnabled?: boolean
}): FollowCreatorPromptCopy => {
  const {
    creatorName: name,
    marketsTraded,
    why,
    digestEnabled = NEW_QUESTION_DIGEST_ENABLED,
  } = props
  const { newQuestionNotifications: status, forYouBoost } = why
  const traded = `You've ${TRADED_TERM} on ${marketsTraded} of ${name}'s questions`
  const bullets: string[] = []
  if (status === 'on') {
    bullets.push(
      'Subscribes you to their new-question notifications (Notifications → Following).' +
        (digestEnabled
          ? ` If they create more than ${NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY} questions in one day (Pacific time), you get one notification for the rest of that day's questions.`
          : '')
    )
  } else if (status === 'in_app_off') {
    bullets.push(
      'Subscribes you to their new-question notifications, but your in-app new-question notifications are off in your settings.'
    )
  }
  if (forYouBoost)
    bullets.push(
      'Gives their questions a ranking boost in your For you feed on Browse.'
    )
  return {
    summary: `${traded}.`,
    action:
      status === 'on'
        ? 'Follow to get their new-question notifications.'
        : `Follow ${name}?`,
    followed:
      status === 'on'
        ? "Following. You'll get their new-question notifications."
        : 'Following.',
    whyTitle: 'Why am I seeing this?',
    whyReason: `${traded}, and you don't follow ${name}.`,
    whyLead: bullets.length > 0 ? `Following ${name}:` : undefined,
    whyBullets: bullets,
    whyFooter: `We won't suggest following ${name} again for ${FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_DAYS} days.`,
  }
}
