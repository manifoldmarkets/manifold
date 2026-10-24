import {
  isValidRelatedMarketsVerdict,
  relatedMarketsFilterKey,
} from './related-markets-filter'

const candidates = [
  { id: 'b', question: 'Will B win?' },
  { id: 'a', question: 'Will A win?' },
]

describe('relatedMarketsFilterKey', () => {
  it('ignores candidate order without changing the ranking', () => {
    expect(relatedMarketsFilterKey('source', 'Who wins?', candidates)).toBe(
      relatedMarketsFilterKey('source', 'Who wins?', [...candidates].reverse())
    )
    expect(candidates.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('invalidates on source identity, source title, candidate title or membership changes', () => {
    const key = relatedMarketsFilterKey('source', 'Who wins?', candidates)
    expect(relatedMarketsFilterKey('other', 'Who wins?', candidates)).not.toBe(
      key
    )
    expect(
      relatedMarketsFilterKey('source', 'Who loses?', candidates)
    ).not.toBe(key)
    expect(
      relatedMarketsFilterKey('source', 'Who wins?', [
        { ...candidates[0], question: 'Will B lose?' },
        candidates[1],
      ])
    ).not.toBe(key)
    expect(
      relatedMarketsFilterKey('source', 'Who wins?', candidates.slice(1))
    ).not.toBe(key)
  })
})

describe('isValidRelatedMarketsVerdict', () => {
  it('accepts a nonempty subset of the supplied IDs', () => {
    expect(isValidRelatedMarketsVerdict(['a'], candidates)).toBe(true)
  })

  it.each([
    undefined,
    null,
    [],
    ['unknown'],
    ['a', 'unknown'],
    [1],
    ['a', null],
    {},
  ])('rejects unusable output %j', (verdict) => {
    expect(isValidRelatedMarketsVerdict(verdict, candidates)).toBe(false)
  })
})
