import {
  capRelatedMarketsPerCreator,
  collapseNearDuplicateRelatedMarkets,
  diversifyRelatedMarkets,
  questionTokens,
  relatedMarketsMaxPerCreator,
  templateVariantKind,
} from './related-markets-diversity'

let nextId = 0
const market = (question: string, creatorId = 'series-creator') => ({
  id: `m${nextId++}`,
  question,
  creatorId,
})
const questions = (markets: { question: string }[]) =>
  markets.map((m) => m.question)
const kind = (a: string, b: string) =>
  templateVariantKind(questionTokens(a), questionTokens(b))

const exportBan = (subject: string, year = 2026) =>
  `Will China restrict exports of ${subject} on December 31, ${year}?`

describe('questionTokens', () => {
  it('drops case, punctuation, possessives, diacritics and thousands separators', () => {
    expect(
      questionTokens("Will China's domestic Café price be above $13,800/t?")
    ).toEqual([
      'will',
      'china',
      'domestic',
      'cafe',
      'price',
      'be',
      'above',
      '$',
      '13800',
      't',
    ])
  })

  it('keeps decimals, signs, comparisons, currency and percent signs', () => {
    expect(questionTokens('Above $90.90/lb?')).toEqual([
      'above',
      '$',
      '90.90',
      'lb',
    ])
    expect(questionTokens('Will US inflation be >3% or ≤ −2%?')).toEqual([
      'will',
      'us',
      'inflation',
      'be',
      '>',
      '3',
      '%',
      'or',
      '<=',
      '-2',
      '%',
    ])
  })

  it('writes every season one way and splits dates and other year ranges', () => {
    expect(
      questionTokens(
        '2026-27, 2026/2027, 2026 - 2027, 2006-07-17, 2026-11 and 2026-2030'
      )
    ).toEqual([
      '2026-27',
      '2026-27',
      '2026-27',
      '2006',
      '07',
      '17',
      '2026',
      '11',
      'and',
      '2026',
      '2030',
    ])
  })
})

describe('questionTokens: seasons and signs next to a year', () => {
  it('reads a space-separated consecutive year pair as a season', () => {
    for (const spelling of ['2025 26', '2025-26', '2025/2026', '2025 - 26'])
      expect(questionTokens(`the ${spelling} season`)).toEqual([
        'the',
        '2025-26',
        'season',
      ])
  })

  it('does not read other year-number pairs as seasons', () => {
    expect(questionTokens('the 2025 -26 season')).toEqual([
      'the',
      '2025',
      '-26',
      'season',
    ])
    expect(questionTokens('December 31, 2026 26 markets')).toEqual([
      'december',
      '31',
      '2026',
      '26',
      'markets',
    ])
    expect(questionTokens('in 2026 1000 people')).toEqual([
      'in',
      '2026',
      '1000',
      'people',
    ])
  })

  it('keeps the sign of a percentage or decimal right after a year', () => {
    expect(
      questionTokens('Will the S&P 500 finish 2026 -10% or worse?')
    ).toContain('-10')
    expect(
      questionTokens('Will the S&P 500 finish 2026 -10.5% or worse?')
    ).toContain('-10.5')
    expect(
      questionTokens('Will the S&P 500 finish 2026 -27% or worse?')
    ).toContain('-27')
  })
})

describe('templateVariantKind', () => {
  it('treats a different subject in a shared frame as a worded variant', () => {
    expect(kind(exportBan('gallium'), exportBan('indium'))).toBe('worded')
    expect(
      kind(
        exportBan('gallium'),
        exportBan('arsenic trichloride or gallium arsenide')
      )
    ).toBe('worded')
    expect(kind(exportBan('gallium'), exportBan('germanium', 2027))).toBe(
      'worded'
    )
  })

  it('treats another checkpoint date or threshold as a numeric variant', () => {
    expect(
      kind(
        'Will the US-China trade truce have been officially extended beyond January 10, 2027 as of December 4, 2026?',
        'Will the US-China trade truce have been officially extended beyond January 10, 2027 as of January 8, 2027?'
      )
    ).toBe('numeric')
    expect(
      kind(
        'Will China have active export controls on silicon metal (MG-Si) on December 31, 2026?',
        'Will China have active export controls on silicon metal (MG-Si) on December 31, 2027?'
      )
    ).toBe('numeric')
    expect(
      kind(
        'Will 2026 nickel production from PT Weda Bay Nickel exceed 42 million wet metric tonnes on December 31, 2026?',
        'Will 2026 nickel production from PT Weda Bay Nickel exceed 30 million wet metric tonnes on December 31, 2026?'
      )
    ).toBe('numeric')
  })

  it('does not treat a different edition or horizon year as a variant', () => {
    expect(
      kind(
        'Will we get AGI before 2027 at the latest?',
        'Will we get AGI before 2030 at the latest?'
      )
    ).toBeUndefined()
    expect(
      kind(
        'Who will win the 2026 FIFA World Cup final in extra time?',
        'Who will win the 2030 FIFA World Cup final in extra time?'
      )
    ).toBeUndefined()
  })

  it('treats different seasons as editions, in either order', () => {
    const season = (range: string) =>
      `Will Arsenal win the Premier League title in the ${range} season?`
    for (const [a, b] of [
      ['2026-2027', '2027-2028'],
      ['2026-27', '2027-28'],
      ['2026/27', '2027/28'],
      ['2026 - 2027', '2028 - 2029'],
    ]) {
      expect(kind(season(a), season(b))).toBeUndefined()
      expect(kind(season(b), season(a))).toBeUndefined()
    }
  })

  it('treats separator-free seasons as editions too', () => {
    expect(
      kind(
        'Will Arsenal win the Premier League title in the 2025 26 season?',
        'Will Arsenal win the Premier League title in the 2026 27 season?'
      )
    ).toBeUndefined()
  })

  it('treats "no later than <year>" as a horizon, not a threshold', () => {
    expect(
      kind(
        'Will humans land on Mars no later than 2030, per NASA?',
        'Will humans land on Mars no later than 2035, per NASA?'
      )
    ).toBeUndefined()
    expect(
      kind(
        'Will the index close at more than 2000 points on Friday?',
        'Will the index close at more than 2050 points on Friday?'
      )
    ).toBe('numeric')
  })

  it('treats thresholds that look like years as numeric variants', () => {
    const eth = (price: string) =>
      `Will ETH close above $${price} on December 31, 2026?`
    for (const price of ['1,900', '1,950', '2,050', '2,100'])
      expect(kind(eth('2,000'), eth(price))).toBe('numeric')
    expect(
      kind(
        'Will the population exceed 2000 people by the end of 2026?',
        'Will the population exceed 2050 people by the end of 2026?'
      )
    ).toBe('numeric')
  })

  it('does not relate different templates or short questions', () => {
    expect(
      kind(
        "Will China's domestic NdPr oxide price be above $110/kg on March 31, 2027?",
        "Will China's domestic antimony metal price be above $13,800/t on March 31, 2027?"
      )
    ).toBeUndefined()
    expect(
      kind(
        'Minnesota Vikings at San Francisco 49ers, Nov 22',
        'Pittsburgh Steelers at Philadelphia Eagles, Nov 22'
      )
    ).toBeUndefined()
    expect(
      kind(
        'Who will be the 2028 Republican vice presidential nominee?',
        'Who will be the 2028 Republican nominee for governor of Indiana?'
      )
    ).toBeUndefined()
    expect(
      kind('Will AGI arrive by 2027?', 'Will AGI arrive by 2030?')
    ).toBeUndefined()
  })

  it('is symmetric', () => {
    const pairs: [string, string][] = [
      [
        exportBan('gallium'),
        exportBan('arsenic trichloride or gallium arsenide'),
      ],
      [
        'Who will be the 2028 Republican vice presidential nominee?',
        'Who will be the 2032 Republican presidential nominee?',
      ],
    ]
    for (const [a, b] of pairs) expect(kind(a, b)).toBe(kind(b, a))
  })
})

describe('collapseNearDuplicateRelatedMarkets', () => {
  const source = {
    question:
      'Will China reinstate or enforce export restrictions on gallium after current suspension expires in Nov?',
    creatorId: 'series-creator',
  }

  it('collapses a same-creator templated series to its best-ranked member', () => {
    const candidates = [
      market(exportBan('gallium')),
      market(exportBan('indium')),
      market(
        "Will China's gallium export price (FOB China) be above $429/kg on June 30, 2027?"
      ),
      market(exportBan('samarium')),
      market(exportBan('dysprosium or terbium')),
      market(exportBan('germanium', 2027)),
      market(
        'Will Nvidia resume selling its top GPUs to China by April 1, 2027?',
        'other'
      ),
    ]
    expect(
      questions(collapseNearDuplicateRelatedMarkets(source, candidates))
    ).toEqual([
      exportBan('gallium'),
      "Will China's gallium export price (FOB China) be above $429/kg on June 30, 2027?",
      'Will Nvidia resume selling its top GPUs to China by April 1, 2027?',
    ])
  })

  it('drops template variants of the source question itself', () => {
    const candidates = [
      market(exportBan('indium')),
      market(exportBan('samarium')),
      market(exportBan('antimony')),
      market(
        'Will China announce new export controls on lithium supply-chain items by March 31, 2027?'
      ),
    ]
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          { question: exportBan('gallium'), creatorId: 'series-creator' },
          candidates
        )
      )
    ).toEqual([
      'Will China announce new export controls on lithium supply-chain items by March 31, 2027?',
    ])
  })

  it('collapses date twins even as a pair, including twins of the source', () => {
    const truce = (asOf: string) =>
      `Will the US-China trade truce have been officially extended beyond January 10, 2027 as of ${asOf}?`
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(source, [
          market(truce('December 4, 2026')),
          market(truce('January 8, 2027')),
        ])
      )
    ).toEqual([truce('December 4, 2026')])
    expect(
      collapseNearDuplicateRelatedMarkets(
        {
          question:
            'CATL receives license renewal for Yichun Lithium mine by end of Dec 2026?',
          creatorId: 'series-creator',
        },
        [
          market(
            'CATL receives license renewal for Yichun Lithium mine by end of Feb 2027?'
          ),
        ]
      )
    ).toEqual([])
  })

  it('keeps a lone pair of worded variants: they are different markets', () => {
    const nominee = (party: string) =>
      `Who will be the ${party} nominee for president in 2028?`
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          { question: nominee('Republican'), creatorId: 'politics' },
          [market(nominee('Democratic'), 'politics')]
        )
      )
    ).toEqual([nominee('Democratic')])
  })

  it('keeps different years of the same question', () => {
    const agi = (year: number) =>
      `Will we get AGI before ${year}, by any definition?`
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          { question: agi(2030), creatorId: 'agi' },
          [
            market(agi(2028), 'agi'),
            market(agi(2027), 'agi'),
            market(agi(2035), 'agi'),
          ]
        )
      )
    ).toEqual([agi(2028), agi(2027), agi(2035)])
  })

  it('keeps similar wording from different creators but drops exact copies', () => {
    const win = (who: string) =>
      `Will ${who} win the 2028 presidential election?`
    const candidates = [
      market(win('Taylor Swift'), 'a'),
      market(win('Gavin Newsom'), 'b'),
      market(win('JD Vance'), 'c'),
      market(win('Pete Buttigieg'), 'd'),
      market('will taylor swift win the 2028 Presidential Election', 'e'),
    ]
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          {
            question: 'Who will win the 2028 US presidential election?',
            creatorId: 'x',
          },
          candidates
        )
      )
    ).toEqual([
      win('Taylor Swift'),
      win('Gavin Newsom'),
      win('JD Vance'),
      win('Pete Buttigieg'),
    ])
  })

  it('keeps opposite comparisons and signs apart, across creators too', () => {
    const candidates = [
      market('Will US inflation be <3% at the end of 2027?', 'a'),
      market('Will US GDP growth be -2% in 2027?', 'b'),
      market('Will US GDP growth be 2% in 2027?', 'c'),
    ]
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          {
            question: 'Will US inflation be >3% at the end of 2027?',
            creatorId: 'x',
          },
          candidates
        )
      )
    ).toEqual(questions(candidates))
  })

  it('treats different spellings of the same season as one question', () => {
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          { question: 'unrelated', creatorId: 'x' },
          [
            market('Will Arsenal win the 2026-27 Premier League?', 'a'),
            market('Will Arsenal win the 2026/27 Premier League?', 'a'),
            market('Will Arsenal win the 2026 - 2027 Premier League?', 'b'),
          ]
        )
      )
    ).toEqual(['Will Arsenal win the 2026-27 Premier League?'])
  })

  it('collapses a separator-free season with its hyphenated spelling', () => {
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          { question: 'unrelated', creatorId: 'x' },
          [
            market('Will Arsenal win the 2025 26 Premier League?', 'a'),
            market('Will Arsenal win the 2025-26 Premier League?', 'b'),
          ]
        )
      )
    ).toEqual(['Will Arsenal win the 2025 26 Premier League?'])
  })

  it('keeps a negative percentage apart from the positive one, across creators', () => {
    const candidates = [
      market('Will the S&P 500 finish 2026 10% or worse?', 'a'),
      market('Will the S&P 500 finish 2026 -10.5% or worse?', 'b'),
    ]
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          {
            question: 'Will the S&P 500 finish 2026 -10% or worse?',
            creatorId: 'x',
          },
          candidates
        )
      )
    ).toEqual(questions(candidates))
  })

  it('collapses a threshold ladder whose prices look like years', () => {
    const eth = (price: string) =>
      `Will ETH close above $${price} on December 31, 2026?`
    expect(
      collapseNearDuplicateRelatedMarkets(
        { question: eth('2,000'), creatorId: 'crypto' },
        ['1,900', '1,950', '2,050', '2,100'].map((p) =>
          market(eth(p), 'crypto')
        )
      )
    ).toEqual([])
  })

  it('drops copies of the source question by other creators', () => {
    expect(
      collapseNearDuplicateRelatedMarkets(
        {
          question: 'Will a Democrat win the 2028 Presidential Election?',
          creatorId: 'x',
        },
        [market('Will a democrat win the 2028 presidential election', 'y')]
      )
    ).toEqual([])
  })

  it('keeps different games from the same sports creator', () => {
    const games = [
      'Pittsburgh Steelers at Philadelphia Eagles, Nov 22',
      'Minnesota Vikings at San Francisco 49ers, Nov 22',
      'Las Vegas Raiders at Denver Broncos, Nov 22',
      'Arizona Cardinals at Kansas City Chiefs, Nov 22',
    ]
    expect(
      questions(
        collapseNearDuplicateRelatedMarkets(
          {
            question: 'Los Angeles Chargers at Baltimore Ravens, Nov 16',
            creatorId: 'bot',
          },
          games.map((q) => market(q, 'bot'))
        )
      )
    ).toEqual(games)
  })

  it('ignores candidates with no usable question', () => {
    expect(
      collapseNearDuplicateRelatedMarkets(source, [market('???')])
    ).toEqual([])
  })
})

describe('large pools', () => {
  it('keeps every member of a large same-creator pool with no variants', () => {
    // Worst case for the pairwise checks: 150 questions from one creator that
    // share most of their wording but differ in three places, so every pair
    // gets aligned and none collapses (~33 ms locally; no wall-clock assert,
    // shared CI runners are far slower and noisier).
    const word = (i: number) => `w${i}`
    const pool = Array.from({ length: 150 }, (_, i) =>
      market(
        `Will the ${word(i * 7)} committee approve the ${word(
          i * 11 + 3
        )} plan for the ${word(
          i * 13 + 5
        )} region before the end of next year?`,
        'one'
      )
    )
    const kept = collapseNearDuplicateRelatedMarkets(
      { question: 'Something else entirely', creatorId: 'x' },
      pool
    )
    expect(kept).toHaveLength(150)
  })
})

describe('capRelatedMarketsPerCreator', () => {
  const ranked = (creators: string) =>
    [...creators].map((creatorId, i) => ({ id: `${creatorId}${i}`, creatorId }))
  const ids = (markets: { id: string }[]) => markets.map((m) => m.id)

  it('takes at most maxPerCreator from one creator while others are available', () => {
    expect(ids(capRelatedMarketsPerCreator(ranked('AAAABBBC'), 5, 2))).toEqual([
      'A0',
      'A1',
      'B4',
      'B5',
      'C7',
    ])
  })

  it('fills a short list with the skipped candidates in rank order', () => {
    expect(ids(capRelatedMarketsPerCreator(ranked('AAAAAB'), 5, 2))).toEqual([
      'A0',
      'A1',
      'B5',
      'A2',
      'A3',
    ])
  })

  it('handles a zero count', () => {
    expect(capRelatedMarketsPerCreator(ranked('AB'), 0, 2)).toEqual([])
  })

  it('scales the cap with the list length', () => {
    expect(relatedMarketsMaxPerCreator(10)).toBe(4)
    expect(relatedMarketsMaxPerCreator(25)).toBe(10)
    expect(relatedMarketsMaxPerCreator(1)).toBe(1)
    expect(relatedMarketsMaxPerCreator(0)).toBe(1)
  })
})

describe('diversifyRelatedMarkets', () => {
  it('lets distinct new markets through on a page saturated by a series', () => {
    const subjects = [
      'gallium',
      'indium',
      'samarium',
      'antimony',
      'scandium',
      'beryllium',
      'cerium',
      'tantalum',
      'holmium',
      'erbium',
      'ytterbium',
      'tellurium',
    ]
    const series = subjects.map((s) => market(exportBan(s)))
    const distinct = [
      market(
        "Will China's suspension of its October 2025 rare-earth export controls still be in effect on November 30, 2026?"
      ),
      market(
        'Will China extend its Ga/Ge/Sb export-ban suspension for the US past Nov 27, 2026, as of December 31, 2026?'
      ),
      market(
        'Will China have extended its europium export-control pause beyond November 10, 2026, as of December 31, 2026?'
      ),
    ]
    const newMarket = market(
      "Will China's gallium export price (FOB China) be above $429/kg on June 30, 2027?"
    )
    const others = [
      market(
        'Will Nvidia resume selling its top GPUs to China by April 1, 2027?',
        'b'
      ),
      market(
        'Will the US force ASML to halt exports to China before 2029?',
        'c'
      ),
    ]
    const result = diversifyRelatedMarkets(
      {
        question:
          'Will China reinstate or enforce export restrictions on gallium after current suspension expires in Nov?',
        creatorId: 'series-creator',
      },
      [...series, ...distinct, newMarket, ...others],
      6,
      relatedMarketsMaxPerCreator(10)
    )
    expect(result).toHaveLength(6)
    expect(result.filter((m) => m.creatorId === 'series-creator')).toHaveLength(
      4
    )
    expect(result).toEqual(expect.arrayContaining([...others, series[0]]))
    expect(result.filter((m) => series.includes(m))).toEqual([series[0]])
    expect(
      diversifyRelatedMarkets(
        { question: 'unrelated', creatorId: 'x' },
        [...series, ...distinct, newMarket],
        10,
        4
      )
    ).toContain(newMarket)
  })
})
