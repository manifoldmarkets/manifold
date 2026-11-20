import {
  getLinkChildError,
  getLinkParentError,
  LinkParentCandidate,
} from './market-links'

const NOW = Date.parse('2026-10-14T12:00:00Z')
const parent: LinkParentCandidate = {
  id: 'game',
  visibility: 'public',
  deleted: false,
  isResolved: false,
  closeTime: NOW + 60 * 60 * 1000,
  isChild: false,
}

describe('getLinkParentError', () => {
  it('accepts an open public market', () => {
    expect(getLinkParentError(parent, 'prop', NOW)).toBeUndefined()
  })

  it('accepts a parent that never closes', () => {
    expect(
      getLinkParentError({ ...parent, closeTime: null }, 'prop', NOW)
    ).toBeUndefined()
  })

  it.each([
    ['missing', null],
    ['deleted', { ...parent, deleted: true }],
    ['itself', parent, 'game'],
    ['unlisted', { ...parent, visibility: 'unlisted' }],
    ['resolved', { ...parent, isResolved: true }],
    ['closed', { ...parent, closeTime: NOW }],
    ['a child itself, which would make a chain', { ...parent, isChild: true }],
  ] as [string, LinkParentCandidate | null, string?][])(
    'refuses a parent that is %s',
    (_, candidate, childId = 'prop') => {
      expect(getLinkParentError(candidate, childId, NOW)).toEqual(
        expect.any(String)
      )
    }
  )
})

describe('getLinkChildError', () => {
  const child = { visibility: 'public', deleted: false, childCount: 0 }

  it('accepts a public market with nothing linked to it', () => {
    expect(getLinkChildError(child)).toBeUndefined()
  })

  it('refuses an unlisted market, which would show under a public one', () => {
    expect(getLinkChildError({ ...child, visibility: 'unlisted' })).toEqual(
      expect.any(String)
    )
  })

  it('refuses a market that is a parent, which would make a chain', () => {
    expect(getLinkChildError({ ...child, childCount: 2 })).toEqual(
      expect.any(String)
    )
  })
})
