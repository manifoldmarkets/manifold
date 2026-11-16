import {
  addPromptedCreatorId,
  FOLLOW_CREATOR_PROMPT_EXCLUDED_CREATOR_IDS,
  FOLLOW_CREATOR_PROMPT_MIN_MARKETS,
  isFollowCreatorPromptCreatorEligible,
  mayPromptToFollowCreator,
  meetsFollowCreatorPromptThreshold,
  parsePromptedCreatorIds,
} from './follow-creator-prompt'

const eligibleFacts = {
  userId: 'trader',
  creatorId: 'creator',
  isFollowing: false,
  isBlocked: false,
  creatorIsBot: false,
  creatorDeleted: false,
}

describe('mayPromptToFollowCreator', () => {
  it('allows another user', () => {
    expect(mayPromptToFollowCreator('trader', 'creator')).toBe(true)
  })

  it('never prompts to follow yourself', () => {
    expect(mayPromptToFollowCreator('creator', 'creator')).toBe(false)
  })

  it('skips official bulk accounts', () => {
    for (const id of FOLLOW_CREATOR_PROMPT_EXCLUDED_CREATOR_IDS) {
      expect(mayPromptToFollowCreator('trader', id)).toBe(false)
    }
  })

  it('rejects empty ids', () => {
    expect(mayPromptToFollowCreator('', 'creator')).toBe(false)
    expect(mayPromptToFollowCreator('trader', '')).toBe(false)
  })
})

describe('isFollowCreatorPromptCreatorEligible', () => {
  it('accepts a regular creator the trader does not follow', () => {
    expect(isFollowCreatorPromptCreatorEligible(eligibleFacts)).toBe(true)
  })

  it.each([
    ['already following', { isFollowing: true }],
    ['blocked either way', { isBlocked: true }],
    ['bot creator', { creatorIsBot: true }],
    ['deleted creator', { creatorDeleted: true }],
    ['own market', { creatorId: 'trader' }],
    [
      'official account',
      { creatorId: FOLLOW_CREATOR_PROMPT_EXCLUDED_CREATOR_IDS[0] },
    ],
  ])('rejects %s', (_, override) => {
    expect(
      isFollowCreatorPromptCreatorEligible({ ...eligibleFacts, ...override })
    ).toBe(false)
  })
})

describe('meetsFollowCreatorPromptThreshold', () => {
  it('starts at the minimum', () => {
    expect(
      meetsFollowCreatorPromptThreshold(FOLLOW_CREATOR_PROMPT_MIN_MARKETS - 1)
    ).toBe(false)
    expect(
      meetsFollowCreatorPromptThreshold(FOLLOW_CREATOR_PROMPT_MIN_MARKETS)
    ).toBe(true)
    expect(meetsFollowCreatorPromptThreshold(1000)).toBe(true)
  })

  it('rejects non-finite counts', () => {
    expect(meetsFollowCreatorPromptThreshold(NaN)).toBe(false)
    expect(meetsFollowCreatorPromptThreshold(Infinity)).toBe(false)
  })
})

describe('prompted creator storage', () => {
  it('parses a stored list and ignores junk', () => {
    expect(parsePromptedCreatorIds(null)).toEqual([])
    expect(parsePromptedCreatorIds('')).toEqual([])
    expect(parsePromptedCreatorIds('not json')).toEqual([])
    expect(parsePromptedCreatorIds('{"a":1}')).toEqual([])
    expect(parsePromptedCreatorIds('["a",2,"b",null]')).toEqual(['a', 'b'])
  })

  it('adds without duplicates, newest last', () => {
    expect(addPromptedCreatorId(['a', 'b'], 'a')).toEqual(['b', 'a'])
    expect(addPromptedCreatorId([], 'a')).toEqual(['a'])
  })

  it('keeps only the newest entries', () => {
    expect(addPromptedCreatorId(['a', 'b', 'c'], 'd', 3)).toEqual([
      'b',
      'c',
      'd',
    ])
    expect(addPromptedCreatorId(['a'], 'b', 0)).toEqual([])
  })
})
