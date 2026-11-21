jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  contractColumnsToSelect: 'data',
  log: Object.assign(jest.fn(), { warn: jest.fn() }),
}))

import { Answer } from 'common/answer'
import { homeAndAway } from 'api/sports-schedule'

const answers = (...texts: string[]) =>
  texts.map((text, index) => ({ id: `a${index}`, index, text } as Answer))

describe("telling a game market's home team from its away team", () => {
  const home = 'Kansas City Chiefs'
  const away = 'Buffalo Bills'

  it('reads an away-first versus market by its stored team names', () => {
    const [h, a] = homeAndAway(answers(away, home), home, away)
    expect(h.text).toBe(home)
    expect(a.text).toBe(away)
  })

  it('reads a home-first market (soccer, or created before the switch)', () => {
    const [h, a] = homeAndAway(answers(home, away), home, away)
    expect(h.text).toBe(home)
    expect(a.text).toBe(away)
  })

  it('matches names through a flag and letter case', () => {
    const [h] = homeAndAway(
      answers('🇧🇷 Brazil', '🇦🇷 Argentina'),
      'argentina',
      'Brazil'
    )
    expect(h.text).toBe('🇦🇷 Argentina')
  })

  it('places a renamed answer by the one it can still match', () => {
    const [h, a] = homeAndAway(answers(away, 'Chiefs'), home, away)
    expect(h.text).toBe('Chiefs')
    expect(a.text).toBe(away)
  })

  it('falls back to home first without stored team names', () => {
    const [h, a] = homeAndAway(answers(home, away), undefined, undefined)
    expect(h.text).toBe(home)
    expect(a.text).toBe(away)
  })
})
