import {
  PROVISIONAL_RECHECK_INTERVAL_MS,
  isDueForRecheck,
  latestTimestamp,
  parseTimestamp,
  sortByLastChecked,
} from './classification-recheck'

const T0 = Date.parse('2026-10-01T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

describe('classification re-check cadence', () => {
  test('provisional interval is a week — longer than any pending cooldown', () => {
    expect(PROVISIONAL_RECHECK_INTERVAL_MS).toBe(7 * DAY)
  })

  test('parses ISO strings and epoch numbers, rejects everything else', () => {
    expect(parseTimestamp('2026-10-01T00:00:00.000Z')).toBe(T0)
    expect(parseTimestamp(T0)).toBe(T0)
    expect(Number.isNaN(parseTimestamp('not a date'))).toBe(true)
    expect(Number.isNaN(parseTimestamp(null))).toBe(true)
    expect(Number.isNaN(parseTimestamp(undefined))).toBe(true)
    expect(Number.isNaN(parseTimestamp({}))).toBe(true)
    expect(Number.isNaN(parseTimestamp(Infinity))).toBe(true)
  })

  test('latestTimestamp ignores unparseable values and returns null for none', () => {
    expect(latestTimestamp([])).toBeNull()
    expect(latestTimestamp([null, 'garbage'])).toBeNull()
    expect(
      latestTimestamp([
        '2026-10-01T00:00:00.000Z',
        null,
        '2026-10-03T00:00:00.000Z',
        'garbage',
      ])
    ).toBe(T0 + 2 * DAY)
  })

  test('a row nobody has looked at is due immediately', () => {
    expect(isDueForRecheck([], DAY, T0)).toBe(true)
    expect(isDueForRecheck([null, undefined, 'bad'], DAY, T0)).toBe(true)
  })

  test('the human verdict counts as a look, so the first re-check waits a full interval', () => {
    const classifiedAt = new Date(T0).toISOString()
    // Six hours later — the very next sweep. Not due.
    expect(isDueForRecheck([null, classifiedAt], 7 * DAY, T0 + DAY / 4)).toBe(
      false
    )
    // Six days later. Still not due.
    expect(isDueForRecheck([null, classifiedAt], 7 * DAY, T0 + 6 * DAY)).toBe(
      false
    )
    // Exactly a week. Due.
    expect(isDueForRecheck([null, classifiedAt], 7 * DAY, T0 + 7 * DAY)).toBe(
      true
    )
  })

  test('the latest look wins, whichever column it came from', () => {
    const classifiedAt = new Date(T0).toISOString()
    const agentRanAt = new Date(T0 + 5 * DAY).toISOString()
    // A week after the verdict but two days after the agent last ran.
    expect(
      isDueForRecheck([agentRanAt, classifiedAt], 7 * DAY, T0 + 7 * DAY)
    ).toBe(false)
    expect(
      isDueForRecheck([agentRanAt, classifiedAt], 7 * DAY, T0 + 12 * DAY)
    ).toBe(true)
  })

  test('sorts never-checked first, then oldest check, keeping input order on ties', () => {
    const rows = [
      { id: 'checked-recently', at: new Date(T0 + 3 * DAY).toISOString() },
      { id: 'never-a', at: null },
      { id: 'checked-long-ago', at: new Date(T0).toISOString() },
      { id: 'never-b', at: 'garbage' },
      { id: 'checked-long-ago-too', at: new Date(T0).toISOString() },
    ]
    expect(sortByLastChecked(rows, (row) => [row.at]).map((r) => r.id)).toEqual(
      [
        'never-a',
        'never-b',
        'checked-long-ago',
        'checked-long-ago-too',
        'checked-recently',
      ]
    )
    // Pure: the input is not reordered.
    expect(rows[0].id).toBe('checked-recently')
  })
})
