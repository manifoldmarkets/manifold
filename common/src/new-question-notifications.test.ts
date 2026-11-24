import {
  formatPacificDay,
  getNewQuestionNotificationMode,
  NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY,
  newQuestionsDigestId,
  newQuestionsDigestTitle,
  parsePacificDay,
} from './new-question-notifications'

describe('getNewQuestionNotificationMode', () => {
  const cap = NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY

  it('notifies one by one up to the daily limit, then digests', () => {
    expect(cap).toBe(5)
    expect(getNewQuestionNotificationMode(1)).toBe('individual')
    expect(getNewQuestionNotificationMode(cap)).toBe('individual')
    expect(getNewQuestionNotificationMode(cap + 1)).toBe('digest')
    expect(getNewQuestionNotificationMode(792)).toBe('digest')
  })

  it('skips followers when the count is unusable', () => {
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, 0, -1])
      expect(getNewQuestionNotificationMode(bad)).toBe('skip')
  })

  it('notifies one by one when the digest is off', () => {
    expect(getNewQuestionNotificationMode(792, false)).toBe('individual')
    expect(getNewQuestionNotificationMode(undefined, false)).toBe('individual')
  })
})

describe('Pacific days', () => {
  it('accepts real calendar dates only', () => {
    expect(parsePacificDay('2026-11-17')).toBeDefined()
    expect(parsePacificDay('2028-02-29')).toBeDefined()
    for (const bad of [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-1-7',
      '2026-11-17T00',
      '../2026-11-17',
      '',
    ])
      expect(parsePacificDay(bad)).toBeUndefined()
  })

  it('formats the date itself, whatever the local timezone', () => {
    // The trap: the same instant read in a zone west of UTC is the day before.
    expect(
      new Date(Date.UTC(2026, 10, 1)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Los_Angeles',
      })
    ).toBe('Oct 31')
    expect(formatPacificDay('2026-11-01')).toBe('Nov 1')
    expect(formatPacificDay('2026-11-17')).toBe('Nov 17')
    expect(formatPacificDay('2028-02-29')).toBe('Feb 29')
    expect(formatPacificDay('2026-02-30')).toBeUndefined()
  })
})

describe('digest notification', () => {
  it('has one id per creator and day', () => {
    expect(newQuestionsDigestId('creator', '2026-11-17')).toBe(
      'new-questions-creator-2026-11-17'
    )
    expect(newQuestionsDigestId('creator', '2026-11-17')).not.toBe(
      newQuestionsDigestId('creator', '2026-11-18')
    )
  })

  it('reads as the rest of a line starting "<creator> asked"', () => {
    expect(newQuestionsDigestTitle('2026-11-17')).toBe(
      'more than 5 questions on Nov 17 (Pacific time)'
    )
  })
})
