import {
  CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS,
  creatorNotifiesFollowersOfNewQuestions,
  FOLLOW_CREATOR_PROMPT_COOLDOWN_MS,
  FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_MS,
  FOLLOW_CREATOR_PROMPT_MIN_MARKETS,
  FOLLOW_CREATOR_PROMPT_STORAGE_PREFIX,
  followCreatorPromptNextAtKey,
  getFollowCreatorPromptCooldown,
  getFollowCreatorPromptCopy,
  getNewQuestionNotificationStatus,
  isFollowCreatorPromptCreatorEligible,
  mayPromptToFollowCreator,
  meetsFollowCreatorPromptThreshold,
  parseFollowCreatorPromptNextAt,
} from './follow-creator-prompt'
import { MANIFOLD_SPORTS_USER_IDS } from './sports'

const eligibleFacts = {
  userId: 'trader',
  creatorId: 'creator',
  isFollowing: false,
  isBlocked: false,
  creatorIsBot: false,
  creatorDeleted: false,
}

describe('mayPromptToFollowCreator', () => {
  it('allows another user, official accounts included', () => {
    expect(mayPromptToFollowCreator('trader', 'creator')).toBe(true)
    for (const id of CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS)
      expect(mayPromptToFollowCreator('trader', id)).toBe(true)
  })

  it('never prompts to follow yourself', () => {
    expect(mayPromptToFollowCreator('creator', 'creator')).toBe(false)
  })

  it('rejects empty ids', () => {
    expect(mayPromptToFollowCreator('', 'creator')).toBe(false)
    expect(mayPromptToFollowCreator('trader', '')).toBe(false)
  })
})

describe('isFollowCreatorPromptCreatorEligible', () => {
  it('accepts a regular creator the trader does not follow', () => {
    expect(isFollowCreatorPromptCreatorEligible(eligibleFacts)).toBe(true)
  })

  it.each([
    ['already following', { isFollowing: true }],
    ['blocked either way', { isBlocked: true }],
    ['bot creator', { creatorIsBot: true }],
    ['deleted creator', { creatorDeleted: true }],
    ['own market', { creatorId: 'trader' }],
  ])('rejects %s', (_, override) => {
    expect(
      isFollowCreatorPromptCreatorEligible({ ...eligibleFacts, ...override })
    ).toBe(false)
  })
})

describe('meetsFollowCreatorPromptThreshold', () => {
  it('starts at the minimum', () => {
    expect(
      meetsFollowCreatorPromptThreshold(FOLLOW_CREATOR_PROMPT_MIN_MARKETS - 1)
    ).toBe(false)
    expect(
      meetsFollowCreatorPromptThreshold(FOLLOW_CREATOR_PROMPT_MIN_MARKETS)
    ).toBe(true)
    expect(meetsFollowCreatorPromptThreshold(1000)).toBe(true)
  })

  it('rejects non-finite counts', () => {
    expect(meetsFollowCreatorPromptThreshold(NaN)).toBe(false)
    expect(meetsFollowCreatorPromptThreshold(Infinity)).toBe(false)
  })
})

describe('getFollowCreatorPromptCooldown', () => {
  const now = 1_800_000_000_000
  const day = FOLLOW_CREATOR_PROMPT_COOLDOWN_MS
  const month = FOLLOW_CREATOR_PROMPT_CREATOR_COOLDOWN_MS
  const cooldown = (
    lastPromptedAtMs: number | null | undefined,
    lastCreatorPromptedAtMs: number | null | undefined,
    nowMs = now
  ) =>
    getFollowCreatorPromptCooldown({
      nowMs,
      lastPromptedAtMs,
      lastCreatorPromptedAtMs,
    })

  it('allows a user who was never prompted', () => {
    expect(cooldown(null, null)).toEqual({ kind: 'none' })
    expect(cooldown(undefined, undefined)).toEqual({ kind: 'none' })
  })

  it('holds the same creator for 30 days', () => {
    expect(cooldown(now - month + 1, now - month + 1)).toEqual({
      kind: 'creator',
    })
    expect(cooldown(now - month, now - month)).toEqual({ kind: 'none' })
  })

  it('holds any creator for 24 hours, and says until when', () => {
    expect(cooldown(now - day + 1, null)).toEqual({
      kind: 'user',
      nextPromptAt: now + 1,
    })
    expect(cooldown(now - day, null)).toEqual({ kind: 'none' })
    // The same creator a day ago: the 30-day rule wins.
    expect(cooldown(now - day, now - day)).toEqual({ kind: 'creator' })
  })

  it('treats bad or future timestamps as recent', () => {
    expect(cooldown(NaN, null)).toEqual({ kind: 'user' })
    expect(cooldown(Infinity, null)).toEqual({ kind: 'user' })
    expect(cooldown(now + 60_000, null)).toEqual({
      kind: 'user',
      nextPromptAt: now + 60_000 + day,
    })
    expect(cooldown(null, NaN)).toEqual({ kind: 'creator' })
    expect(cooldown(null, now + 60_000)).toEqual({ kind: 'creator' })
  })

  it('holds off without a readable clock', () => {
    expect(cooldown(null, null, NaN)).toEqual({ kind: 'user' })
    expect(cooldown(null, now - month, NaN)).toEqual({ kind: 'creator' })
  })
})

describe('next prompt hint', () => {
  it('is per user under the shared prefix', () => {
    const key = followCreatorPromptNextAtKey('u1')
    expect(key.startsWith(FOLLOW_CREATOR_PROMPT_STORAGE_PREFIX)).toBe(true)
    expect(key.endsWith('u1')).toBe(true)
    expect(key).not.toBe(followCreatorPromptNextAtKey('u2'))
  })

  it('parses only finite numbers', () => {
    expect(parseFollowCreatorPromptNextAt(null)).toBeUndefined()
    expect(parseFollowCreatorPromptNextAt('')).toBeUndefined()
    expect(parseFollowCreatorPromptNextAt('soon')).toBeUndefined()
    expect(parseFollowCreatorPromptNextAt('Infinity')).toBeUndefined()
    expect(parseFollowCreatorPromptNextAt('1800000000000')).toBe(
      1_800_000_000_000
    )
  })
})

describe('creators without new-question notifications', () => {
  it('are the @ManifoldSports accounts', () => {
    expect([...CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS].sort()).toEqual(
      [...MANIFOLD_SPORTS_USER_IDS].sort()
    )
  })

  it('get no notification claim', () => {
    const [sports] = CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS
    expect(creatorNotifiesFollowersOfNewQuestions(sports)).toBe(false)
    expect(getNewQuestionNotificationStatus(sports, true)).toBe('none')
    expect(getNewQuestionNotificationStatus(sports, false)).toBe('none')
    expect(creatorNotifiesFollowersOfNewQuestions('creator')).toBe(true)
    expect(getNewQuestionNotificationStatus('creator', true)).toBe('on')
    expect(getNewQuestionNotificationStatus('creator', false)).toBe(
      'in_app_off'
    )
  })
})

describe('getFollowCreatorPromptCopy', () => {
  const SUBSCRIBE_ON =
    "Subscribes you to their new-question notifications (Notifications → Following). If they create more than 5 questions in one day (Pacific time), you get one notification for the rest of that day's questions."
  const SUBSCRIBE_OFF =
    'Subscribes you to their new-question notifications, but your in-app new-question notifications are off in your settings.'
  const BOOST =
    'Gives their questions a ranking boost in your For you feed on Browse.'
  const copy = (
    why: Parameters<typeof getFollowCreatorPromptCopy>[0]['why'],
    creatorName = 'Mikhail',
    digestEnabled?: boolean
  ) =>
    getFollowCreatorPromptCopy({
      creatorName,
      marketsTraded: 3,
      why,
      digestEnabled,
    })

  it('notifications on, with the For you boost', () => {
    expect(copy({ newQuestionNotifications: 'on', forYouBoost: true })).toEqual(
      {
        summary: "You've bet on 3 of Mikhail's questions.",
        action: 'Follow to get their new-question notifications.',
        followed: "Following. You'll get their new-question notifications.",
        whyTitle: 'Why am I seeing this?',
        whyReason:
          "You've bet on 3 of Mikhail's questions, and you don't follow Mikhail.",
        whyLead: 'Following Mikhail:',
        whyBullets: [SUBSCRIBE_ON, BOOST],
        whyFooter: "We won't suggest following Mikhail again for 30 days.",
      }
    )
  })

  it('notifications on, without the boost', () => {
    const c = copy({ newQuestionNotifications: 'on', forYouBoost: false })
    expect(c.whyBullets).toEqual([SUBSCRIBE_ON])
    expect(c.action).toBe('Follow to get their new-question notifications.')
  })

  it('in-app notifications off', () => {
    const c = copy({
      newQuestionNotifications: 'in_app_off',
      forYouBoost: true,
    })
    expect(c.action).toBe('Follow Mikhail?')
    expect(c.followed).toBe('Following.')
    expect(c.whyBullets).toEqual([SUBSCRIBE_OFF, BOOST])
    const noBoost = copy({
      newQuestionNotifications: 'in_app_off',
      forYouBoost: false,
    })
    expect(noBoost.whyBullets).toEqual([SUBSCRIBE_OFF])
  })

  it('makes no notification claim for a creator whose markets never notify', () => {
    const c = copy(
      { newQuestionNotifications: 'none', forYouBoost: true },
      'ManifoldSports'
    )
    expect(c.action).toBe('Follow ManifoldSports?')
    expect(c.followed).toBe('Following.')
    expect(c.whyLead).toBe('Following ManifoldSports:')
    expect(c.whyBullets).toEqual([BOOST])
    for (const text of [c.summary, c.action, c.followed, ...c.whyBullets])
      expect(text).not.toMatch(/notif/i)
  })

  it('drops the lead when there is nothing to list', () => {
    const c = copy({ newQuestionNotifications: 'none', forYouBoost: false })
    expect(c.whyLead).toBeUndefined()
    expect(c.whyBullets).toEqual([])
    expect(c.whyFooter).toBe(
      "We won't suggest following Mikhail again for 30 days."
    )
  })

  it('leaves out the daily limit when the digest is off', () => {
    const c = copy(
      { newQuestionNotifications: 'on', forYouBoost: false },
      'Mikhail',
      false
    )
    expect(c.whyBullets).toEqual([
      'Subscribes you to their new-question notifications (Notifications → Following).',
    ])
  })

  it('keeps names as given', () => {
    const c = copy(
      { newQuestionNotifications: 'on', forYouBoost: false },
      'James'
    )
    expect(c.summary).toBe("You've bet on 3 of James's questions.")
    expect(c.whyFooter).toBe(
      "We won't suggest following James again for 30 days."
    )
  })

  it('stays true after the user follows from the prompt', () => {
    const before = getFollowCreatorPromptCopy({
      creatorName: 'Mikhail',
      marketsTraded: 3,
      why: { newQuestionNotifications: 'on', forYouBoost: true },
    })
    const after = getFollowCreatorPromptCopy({
      creatorName: 'Mikhail',
      marketsTraded: 3,
      why: { newQuestionNotifications: 'on', forYouBoost: true },
      following: true,
    })
    expect(after.whyReason).toBe(
      "You've bet on 3 of Mikhail's questions. You now follow Mikhail."
    )
    expect(after.whyReason).not.toMatch(/don't follow/)
    expect(after.whyFooter).toBeUndefined()
    // What following does is the same either way.
    expect(after.whyLead).toBe(before.whyLead)
    expect(after.whyBullets).toEqual(before.whyBullets)
    expect(after.followed).toBe(before.followed)
  })
})
