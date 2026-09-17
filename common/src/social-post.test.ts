import {
  socialCursorSchema,
  socialPostContentSchema,
  socialTimestamp,
  socialTimestampMillis,
} from './social-post'
import { combineReactionNotifications, Notification } from './notification'

describe('social post validation', () => {
  test('accepts image-only posts with at most four HTTPS images', () => {
    const imageUrls = Array.from(
      { length: 4 },
      (_, i) => `https://example.com/${i}.png`
    )
    expect(
      socialPostContentSchema.parse({ text: '', imageUrls }).imageUrls
    ).toEqual(imageUrls)
    expect(
      socialPostContentSchema.safeParse({
        text: '',
        imageUrls: [...imageUrls, 'https://example.com/5.png'],
      }).success
    ).toBe(false)
    for (const url of [
      'javascript:alert(1)',
      'data:image/png;base64,a',
      'http://example.com/a.png',
      'not-a-url',
    ]) {
      expect(
        socialPostContentSchema.safeParse({ text: '', imageUrls: [url] })
          .success
      ).toBe(false)
    }
    expect(
      socialPostContentSchema.safeParse({ text: '', imageUrls: [] }).success
    ).toBe(false)
    // Older clients omit imageUrls; edits must distinguish omission from removal.
    expect(
      socialPostContentSchema.parse({ text: 'old client' }).imageUrls
    ).toBeUndefined()
    expect(
      socialPostContentSchema.parse({ text: 'remove images', imageUrls: [] })
        .imageUrls
    ).toEqual([])
  })
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
  test('display timestamps truncate microseconds without changing cursor precision', () => {
    const input = '2026-09-15 12:01:01.123456+00'
    expect(socialTimestampMillis(input)).toBe(
      Date.UTC(2026, 8, 15, 12, 1, 1, 123)
    )
    expect(socialTimestampMillis('2026-09-15 14:01:01.123456+02')).toBe(
      socialTimestampMillis(input)
    )
    expect(socialTimestamp(input)).toContain('.123456')
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
