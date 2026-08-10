import { PrivateUser } from './user'
import {
  bot_notification_level,
  botNotificationAllowed,
  DEFAULT_BOT_NOTIFICATION_LEVEL,
  getDefaultNotificationPreferences,
} from './user-notification-preferences'

const privateUserWith = (level?: bot_notification_level) =>
  ({
    id: 'u1',
    notificationPreferences: getDefaultNotificationPreferences(),
    blockedUserIds: [],
    blockedByUserIds: [],
    blockedContractIds: [],
    blockedGroupSlugs: [],
    ...(level ? { botNotificationLevel: level } : {}),
  } as PrivateUser)

// Reasons a bot can generate on a comment, split by whether the bot was
// addressing this user or just commenting where they happened to be attached.
const DIRECT = [
  'tagged_user',
  'reply_to_users_comment',
  'reply_to_users_answer',
] as const
const AMBIENT = [
  'all_comments_on_my_markets',
  'comment_on_contract_with_users_shares_in',
  'comment_on_contract_you_follow',
  'all_comments_on_followed_posts',
] as const

describe('botNotificationAllowed', () => {
  it('defaults to mentions when the user has never set a level', () => {
    const user = privateUserWith()
    expect(DEFAULT_BOT_NOTIFICATION_LEVEL).toEqual('mentions')
    for (const reason of DIRECT) {
      expect(botNotificationAllowed(user, reason)).toBe(true)
    }
    for (const reason of AMBIENT) {
      expect(botNotificationAllowed(user, reason)).toBe(false)
    }
  })

  it("lets nothing through at 'never'", () => {
    const user = privateUserWith('never')
    for (const reason of [...DIRECT, ...AMBIENT]) {
      expect(botNotificationAllowed(user, reason)).toBe(false)
    }
  })

  it("lets everything through at 'always'", () => {
    const user = privateUserWith('always')
    for (const reason of [...DIRECT, ...AMBIENT]) {
      expect(botNotificationAllowed(user, reason)).toBe(true)
    }
  })

  it("passes direct interactions but not the firehose at 'mentions'", () => {
    const user = privateUserWith('mentions')
    for (const reason of DIRECT) {
      expect(botNotificationAllowed(user, reason)).toBe(true)
    }
    for (const reason of AMBIENT) {
      expect(botNotificationAllowed(user, reason)).toBe(false)
    }
  })
})
