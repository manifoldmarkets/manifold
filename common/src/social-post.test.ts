import {
  socialCursorSchema,
  socialPostContentSchema,
  socialTimestamp,
} from './social-post'
import { combineReactionNotifications, Notification } from './notification'

describe('social post validation', () => {
  test('accepts text or one to five distinct markets', () => {
    expect(
      socialPostContentSchema.parse({ text: '  hello\nworld  ' }).text
    ).toBe('hello\nworld')
    expect(
      socialPostContentSchema.safeParse({
        text: '',
        marketIds: ['a', 'b', 'c', 'd', 'e'],
      }).success
    ).toBe(true)
    expect(
      socialPostContentSchema.safeParse({
        text: 'hello',
        marketIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      }).success
    ).toBe(false)
    expect(
      socialPostContentSchema.safeParse({
        text: 'hello',
        marketIds: ['a', 'a'],
      }).success
    ).toBe(false)
    expect(socialPostContentSchema.safeParse({ text: ' \n ' }).success).toBe(
      false
    )
  })
  test('counts Unicode code points identically to the composer', () => {
    expect(
      socialPostContentSchema.safeParse({ text: '😀'.repeat(2000) }).success
    ).toBe(true)
    expect(
      socialPostContentSchema.safeParse({ text: '😀'.repeat(2001) }).success
    ).toBe(false)
    expect(
      socialPostContentSchema.safeParse({ text: { type: 'doc' } }).success
    ).toBe(false)
  })
  test('preserves Postgres timestamp precision through pagination', () => {
    expect(socialTimestamp('2026-09-15 12:01:01.123456+00')).toBe(
      '2026-09-15T12:01:01.123456+00:00'
    )
    expect(
      socialCursorSchema.parse('2026-09-15 12:01:01.123456+00|abc_-')
    ).toBe('2026-09-15 12:01:01.123456+00|abc_-')
    expect(
      socialCursorSchema.safeParse('2026-09-15T12:01:01.123Z|abc').success
    ).toBe(true)
    expect(socialCursorSchema.safeParse('not-a-date|abc').success).toBe(false)
    expect(
      socialCursorSchema.safeParse('2026-09-15T12:01:01.123Z|abc|extra').success
    ).toBe(false)
  })
  test('groups likes by post identity even when text changes', () => {
    const a = {
      sourceType: 'social_post_like',
      sourceId: 'a',
      sourceTitle: 'your post on Yap',
      sourceText: 'old',
    } as Notification
    const b = { ...a, sourceText: 'edited' }
    const c = { ...a, sourceId: 'b' }
    const groups = combineReactionNotifications([a, b, c])
    expect(groups).toHaveLength(2)
    expect(groups[0].data?.relatedNotifications).toHaveLength(2)
  })
})
