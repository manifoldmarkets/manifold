// Followers get one notification per new public question from a creator, up
// to NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY a day. Past that, one
// digest notification per follower stands for the rest of that creator's
// questions that Pacific day. The day is the market's America/Los_Angeles
// calendar day, computed in Postgres so DST is handled by the tz database.
// Backend: backend/shared/src/notifications/create-new-contract-notif.ts.
// Web: web/components/notifications/notification-types.tsx.

/** Kill switch. Off: every public market notifies followers individually. */
export const NEW_QUESTION_DIGEST_ENABLED = true

export const NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY = 5

export const NEW_QUESTIONS_DIGEST_SOURCE_TYPE = 'new_questions_digest'

/** Stored in the digest notification's `data`. */
export type NewQuestionsDigestData = {
  creatorId: string
  /** YYYY-MM-DD, the America/Los_Angeles calendar day of the markets. */
  day: string
}

export type NewQuestionNotificationMode = 'individual' | 'digest' | 'skip'

/**
 * `marketsThatDay` is every market the creator created on the new market's
 * Pacific day (any visibility, deleted ones too), counted when its
 * notification runs, so it includes the new market and never decreases.
 * Anything unreadable skips follower notifications (fail closed): a broken
 * count must not let a bulk creator's markets through one by one.
 */
export const getNewQuestionNotificationMode = (
  marketsThatDay: number | null | undefined,
  enabled = NEW_QUESTION_DIGEST_ENABLED
): NewQuestionNotificationMode => {
  if (!enabled) return 'individual'
  if (
    typeof marketsThatDay !== 'number' ||
    !Number.isFinite(marketsThatDay) ||
    marketsThatDay < 1
  )
    return 'skip'
  return marketsThatDay > NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY
    ? 'digest'
    : 'individual'
}

const PACIFIC_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parses a YYYY-MM-DD calendar date; undefined unless it is a real date. */
export const parsePacificDay = (day: string) => {
  const match = PACIFIC_DAY_PATTERN.exec(day)
  if (!match) return undefined
  const [year, month, date] = match.slice(1).map(Number)
  const utc = new Date(Date.UTC(year, month - 1, date))
  return utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === date
    ? utc
    : undefined
}

/**
 * "Nov 17". Formats the date's own parts (as UTC), never the viewer's local
 * reading of a UTC midnight, which is the previous day west of UTC.
 */
export const formatPacificDay = (day: string) => {
  const date = parsePacificDay(day)
  return date
    ? date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : undefined
}

/**
 * Shared by all followers; user_notifications' primary key is
 * (user_id, notification_id), so each follower has their own row. Look it up
 * with both columns (see PR #4143).
 */
export const newQuestionsDigestId = (creatorId: string, day: string) =>
  `new-questions-${creatorId}-${day}`

/** "more than 5 questions on Nov 17 (Pacific time)" */
export const newQuestionsDigestTitle = (day: string) =>
  `more than ${NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY} questions on ${
    formatPacificDay(day) ?? day
  } (Pacific time)`
