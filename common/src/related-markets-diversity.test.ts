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
      '13800',
      't',
    ])
  })

  it('keeps decimals whole', () => {
    expect(questionTokens('Above $90.90/lb?')).toEqual(['above', '90.90', 'lb'])
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
