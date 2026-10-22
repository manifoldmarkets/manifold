import { rankVersusPositionUsers, VersusPositionRow } from './versus-positions'

const row = (
  user_id: string,
  answer_id: string | null,
  total_shares_yes: number | null,
  total_shares_no: number | null
): VersusPositionRow => ({
  user_id,
  answer_id,
  total_shares_yes,
  total_shares_no,
})

describe('rankVersusPositionUsers', () => {
  it('ranks summed positions before pagination hides either answer metric', () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) =>
        row(`main-${i}`, 'home', 100 - i, 0)
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        row(`other-${i}`, 'away', 0, 100 - i)
      ),
      // This user is 51st in each answer's query, but 7th after summing.
      row('split-holder', 'home', 49, 0),
      row('split-holder', 'away', 0, 49),
      row('no-holder', 'away', 75, 0),
    ]
    const users = rankVersusPositionUsers(rows, 'home', 'away')
    expect(users.yes).toHaveLength(101)
    expect(users.yes.indexOf('split-holder')).toBe(6)
    expect(users.yes.slice(0, 20)).toContain('split-holder')
    expect(users.no).toEqual(['no-holder'])
    const pages = [
      users.yes.slice(0, 50),
      users.yes.slice(50, 100),
      users.yes.slice(100),
    ]
    expect(new Set(pages.flat()).size).toBe(101)
  })

  it('mirrors both answer sides, sums equivalent shares, and counts each user once', () => {
    const rows = [
      row('main-only', 'home', 10, 0),
      row('equivalent-main', 'home', 10, 0),
      row('equivalent-main', 'away', 0, 20),
      row('other-only', 'away', 30, 0),
      row('equivalent-other', 'home', 0, 40),
      row('equivalent-other', 'away', 50, 0),
      row('both', 'home', 20, 0),
      row('both', 'away', 60, 0),
    ]
    expect(rankVersusPositionUsers(rows, 'home', 'away')).toEqual({
      yes: ['equivalent-main', 'both', 'main-only'],
      no: ['equivalent-other', 'other-only'],
    })
  })

  it('applies the holder threshold to summed fractional shares', () => {
    expect(
      rankVersusPositionUsers(
        [
          row('fractional-yes', 'home', 0.6, 0),
          row('fractional-yes', 'away', 0, 0.6),
          row('fractional-no', 'home', 0, 0.5),
          row('fractional-no', 'away', 0.5, 0),
          row('dust', 'home', 0.4, 0),
          row('dust', 'away', 0, 0.4),
        ],
        'home',
        'away'
      )
    ).toEqual({ yes: ['fractional-yes'], no: ['fractional-no'] })
  })

  it('ignores summaries, unrelated answers, null shares, and duplicate rows', () => {
    const position = row('holder', 'home', 5, null)
    const original = { ...position }
    expect(
      rankVersusPositionUsers(
        [
          row('summary', null, 1000, 1000),
          row('unrelated', 'draw', 1000, 1000),
          row('sold-out', 'home', null, null),
          position,
          position,
          row('larger', 'home', 8, 0),
        ],
        'home',
        'away'
      )
    ).toEqual({ yes: ['larger', 'holder'], no: [] })
    expect(position).toEqual(original)
  })

  it('breaks equal-share ties consistently regardless of row order', () => {
    const rows = [
      row('b', 'home', 10, 0),
      row('a', 'away', 0, 10),
      row('d', 'home', 0, 10),
      row('c', 'away', 10, 0),
    ]
    const expected = { yes: ['a', 'b'], no: ['c', 'd'] }
    expect(rankVersusPositionUsers(rows, 'home', 'away')).toEqual(expected)
    expect(rankVersusPositionUsers(rows.reverse(), 'home', 'away')).toEqual(
      expected
    )
  })

  it('handles no holders', () => {
    expect(rankVersusPositionUsers([], 'home', 'away')).toEqual({
      yes: [],
      no: [],
    })
  })
})
