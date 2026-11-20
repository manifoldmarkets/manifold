import { readFileSync } from 'fs'
import { join } from 'path'
import type { ProviderOdds } from '../sports-provider'
import { DAY_MS } from '../util/time'
import { BDL_ODDS_MAX_AGE_MS } from './constants'
import {
  OpeningLineGame,
  reportMissingPolymarketTeams,
  selectOpeningLine,
} from './opening-line'

const now = Date.parse('2026-10-20T15:10:00Z')
const game: OpeningLineGame = {
  eventId: '11',
  league: 'nba',
  entrantIds: ['away', 'home'],
}
const soccer: OpeningLineGame = {
  ...game,
  league: 'epl',
  entrantIds: ['home', 'away'],
}
const home = { entrantId: 'home' }
const away = { entrantId: 'away' }

function row(
  vendor: string,
  prices: number[],
  updatedAtMs = now,
  eventId = game.eventId
): ProviderOdds {
  const outcomes = [away, home, 'draw'] as const
  return {
    vendor,
    eventId,
    updatedAtMs,
    outcomes: prices.map((americanOdds, i) => ({
      outcome: outcomes[i],
      americanOdds,
    })),
  }
}
const select = (rows: ProviderOdds[], target = game) =>
  selectOpeningLine(rows, target, now)

type FixtureRow = {
  game_id: number
  vendor: string
  moneyline_home_odds: number
  moneyline_away_odds: number
  updated_at: string
}
const fixture: { data: FixtureRow[] } = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../backend/shared/test/fixtures/bdl/nba/odds__spec-opening-line.json'
    ),
    'utf8'
  )
)
const slate = fixture.data.map((x) =>
  row(
    x.vendor,
    [x.moneyline_away_odds, x.moneyline_home_odds],
    Date.parse(x.updated_at),
    String(x.game_id)
  )
)

describe('BDL opening moneylines', () => {
  it.each([
    ['11', 'polymarket', 0, 180 / 280],
    ['12', 'polymarket', 0, 140 / 240],
    ['13', 'polymarket', 2, 149 / 249],
    ['14', 'kalshi', 1, 145 / 245],
  ] as const)(
    'prices synthetic game %s from %s with %i complete books',
    (eventId, source, bookCount, first) => {
      const result = select(slate, { ...game, eventId })
      expect(result).toMatchObject({
        source,
        bookCount,
        vendors: [source],
        sampledTime: now,
      })
      expect(result.probs[0]).toBeCloseTo(first, 12)
      expect(result.probs[1]).toBeCloseTo(1 - first, 12)
    }
  )
  it('accepts a near-even exchange line on its own', () => {
    expect(select([row('polymarket', [-102, 102])])).toMatchObject({
      source: 'polymarket',
      bookCount: 0,
    })
  })
  it.each([
    [100, 100],
    [-100, -100],
    [-100, 100],
    [100, -100],
    [102, 102],
    [104, 104],
    [106, 106],
    [-525, 111],
    [-106, -233],
  ])('rejects an exchange placeholder or broken overround %i / %i', (a, b) => {
    for (const vendor of ['polymarket', 'kalshi']) {
      expect(select([row(vendor, [a, b])])).toEqual({
        source: 'none',
        probs: [],
        bookCount: 0,
        vendors: [],
        sampledTime: now,
      })
    }
  })
  it('accepts both inclusive exchange overround endpoints', () => {
    for (const total of [0.995, 1.005]) {
      const p = total - 0.4
      expect(select([row('kalshi', [(-100 * p) / (1 - p), 150])]).source).toBe(
        'kalshi'
      )
    }
  })
  it('drops a stale or future quote and accepts exactly thirty minutes old', () => {
    expect(
      select([row('polymarket', [-150, 150], now - BDL_ODDS_MAX_AGE_MS)]).source
    ).toBe('polymarket')
    for (const t of [now - BDL_ODDS_MAX_AGE_MS - 1, now + 1, NaN, Infinity]) {
      expect(select([row('polymarket', [-150, 150], t)]).source).toBe('none')
    }
  })
  it('rejects a nonfinite sampling clock', () => {
    expect(() => selectOpeningLine([], game, NaN)).toThrow(RangeError)
  })
  it('takes the latest observation per vendor independent of row order', () => {
    const old = row('polymarket', [-240, 240], now - 1)
    const recent = row('POLYMARKET ', [-150, 150])
    for (const rows of [
      [old, recent],
      [recent, old],
    ]) {
      expect(select(rows).probs).toEqual([0.6, 0.4])
    }
  })
  it('a newer incomplete or placeholder row withdraws the old usable price', () => {
    for (const prices of [[-125], [100, 100]]) {
      expect(
        select([
          row('polymarket', prices),
          row('polymarket', [-200, 200], now - 1),
          row('kalshi', [-125, 125]),
        ]).source
      ).toBe('kalshi')
    }
  })
  it('counts identical snapshots once but rejects ambiguous equal-time prices', () => {
    const good = row('new-book', [-150, 150])
    expect(
      select([good, { ...good, outcomes: [...good.outcomes].reverse() }])
    ).toMatchObject({ source: 'books', bookCount: 1, probs: [0.6, 0.4] })
    expect(select([good, row('new-book', [-160, 160])]).source).toBe('none')
    expect(select([good, row('new-book', [-160])]).source).toBe('none')
  })
  it('requires a real vendor and the requested event', () => {
    expect(
      select([
        row('   ', [-120, 120]),
        row('polymarket', [-140, 140], now, 'other'),
      ]).source
    ).toBe('none')
  })
  it('excludes invalid American prices, missing entrants and extra outcomes', () => {
    for (const price of [0, 90, -99, Infinity, NaN]) {
      expect(select([row('book', [price, -180])]).source).toBe('none')
    }
    const quote = row('book', [-155, 130])
    expect(
      select([{ ...quote, outcomes: [quote.outcomes[0], quote.outcomes[0]] }])
        .source
    ).toBe('none')
    expect(select([row('book', [-155, 130, 500])]).source).toBe('none')
    expect(select([row('book', [-155])]).source).toBe('none')
  })
  it('declines invalid market identities including a repeated entrant', () => {
    const quote = row('book', [-155, 130])
    expect(
      select([{ ...quote, eventId: '' }], { ...game, eventId: '' }).source
    ).toBe('none')
    const noId = {
      ...quote,
      outcomes: [
        { outcome: { entrantId: '  ' }, americanOdds: -200 },
        quote.outcomes[1],
      ],
    }
    expect(select([noId], { ...game, entrantIds: ['  ', 'home'] }).source).toBe(
      'none'
    )
    expect(
      select([quote], { ...game, entrantIds: ['away', 'away'] }).source
    ).toBe('none')
  })
  it('defers esports, unpriced basketball leagues and field futures', () => {
    for (const league of [
      'cs',
      'valorant',
      'dota',
      'lol',
      'euroleague',
      'cba',
      'pga',
      'f1',
    ] as const) {
      expect(
        select([row('synthetic-book', [-130, 130])], { ...game, league }).source
      ).toBe('none')
    }
  })
  it('orders neutral participants by the requested entrant IDs', () => {
    expect(
      select([row('book', [-150, 150])], {
        ...game,
        league: 'atp',
        entrantIds: ['home', 'away'],
      }).probs
    ).toEqual([0.4, 0.6])
  })
  it('averages each complete devigged book once and reports contributing vendors', () => {
    const a = row('book-a', [-300, 100])
    const b = row(' Book-B ', [200, -300])
    const line = select([
      b,
      a,
      a,
      row('book-c', [-120]),
      row('book-d', [100, 100], now - BDL_ODDS_MAX_AGE_MS - 1),
      row('polymarket', [100, -100]),
    ])
    expect(line).toMatchObject({
      bookCount: 2,
      source: 'books',
      vendors: ['book-a', 'book-b'],
      sampledTime: now,
    })
    expect(line.probs[0]).toBeCloseTo(
      (0.75 / 1.25 + 1 / 3 / (1 / 3 + 0.75)) / 2,
      12
    )
    expect(line.probs[0] + line.probs[1]).toBeCloseTo(1, 14)
  })
  it('sportsbooks can quote even money and ordinary bookmaker overrounds', () => {
    expect(select([row('book', [100, -100])])).toMatchObject({
      source: 'books',
      probs: [0.5, 0.5],
    })
    expect(select([row('book', [-150, -120])]).source).toBe('books')
  })
  it('falls from Polymarket to Kalshi to books when a candidate is outside the five-point band', () => {
    const book = row('book', [100, 100])
    const pm = row('polymarket', [-240, 240])
    expect(select([pm, row('kalshi', [-110, 110]), book]).source).toBe('kalshi')
    expect(select([pm, row('kalshi', [-190, 190]), book])).toMatchObject({
      source: 'books',
      probs: [0.5, 0.5],
      vendors: ['book'],
      bookCount: 1,
    })
    expect(select([pm, row('book', [100])]).source).toBe('polymarket')
  })
  it('accepts exactly five points of disagreement', () => {
    const price = (100 * 0.55) / 0.45
    expect(
      select([row('kalshi', [-price, price]), row('book', [-100, 100])]).source
    ).toBe('kalshi')
  })
  it('fits exchange and book probabilities into the tradeable range', () => {
    for (const vendor of ['kalshi', 'book']) {
      expect(select([row(vendor, [-100000, 100000])]).probs).toEqual([
        0.99, 0.01,
      ])
    }
  })
  it('requires the soccer draw and returns home, away, draw even when the row is shuffled', () => {
    const quote = row('polymarket', [300, 150, 100 / 0.35 - 100])
    const shuffled = {
      ...quote,
      outcomes: [quote.outcomes[2], quote.outcomes[0], quote.outcomes[1]],
    }
    expect(select([shuffled], soccer).source).toBe('polymarket')
    expect(select([shuffled], soccer).probs).toEqual([0.4, 0.25, 0.35])
    expect(select([row('book', [300, 150])], soccer).source).toBe('none')
    expect(
      select(
        [
          {
            ...quote,
            outcomes: [quote.outcomes[0], quote.outcomes[1], quote.outcomes[1]],
          },
        ],
        soccer
      ).source
    ).toBe('none')
  })
  it('applies the full three-way exchange overround and checks every outcome against books', () => {
    const book = row('book', [300, 150, 100 / 0.35 - 100])
    expect(
      select([book, row('polymarket', [300, 150, 125])], soccer).source
    ).toBe('books')
    const pm = row('polymarket', [100 / 0.31 - 100, 150, 100 / 0.29 - 100])
    expect(select([book, pm], soccer).source).toBe('books')
  })
})

describe('missing Polymarket row diagnostics', () => {
  const games = ['11', '12', '13', '14'].map((eventId) => ({
    eventId,
    homeTeam: 'Home ' + eventId,
    awayTeam: eventId === '14' ? 'Sacramento Kings' : 'Away ' + eventId,
    startTimeMs: now + DAY_MS,
  }))
  it('logs both teams only when most games on the BDL date have a PM row', () => {
    const log = jest.fn()
    reportMissingPolymarketTeams('nba', games, slate, now, log)
    expect(log.mock.calls).toEqual([
      [
        'pm_missing_for_team',
        {
          league: 'nba',
          eventId: '14',
          homeTeam: 'Home 14',
          awayTeam: 'Sacramento Kings',
        },
      ],
    ])
    // Other event IDs and duplicate quotes do not count towards the date's majority.
    reportMissingPolymarketTeams(
      'nba',
      games,
      [
        ...slate.filter((r) => r.eventId !== '13'),
        row('polymarket', [-130, 130], now, 'unrelated'),
        row('polymarket', [-180, 180]),
      ],
      now,
      log
    )
    expect(log).toHaveBeenCalledTimes(1)
  })
  it('a stale or placeholder PM row still counts as listed and only in-window absences log', () => {
    const log = jest.fn()
    const observations = [
      row('polymarket', [100, 100], 0, '11'),
      row('polymarket', [-110, 110], now, '12'),
      row('polymarket', [-150, 150], now, '13'),
    ]
    for (const lead of [0, -1, 14 * DAY_MS + 1, NaN]) {
      reportMissingPolymarketTeams(
        'nba',
        games.map((g) =>
          g.eventId === '14' ? { ...g, startTimeMs: now + lead } : g
        ),
        observations,
        now,
        log
      )
    }
    expect(log).not.toHaveBeenCalled()
    reportMissingPolymarketTeams(
      'nba',
      games.map((g) => ({ ...g, startTimeMs: now + 14 * DAY_MS })),
      observations,
      now,
      log
    )
    expect(log).toHaveBeenCalledTimes(1)
  })
})
