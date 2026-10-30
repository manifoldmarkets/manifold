import {
  applyDisinterestTopicPenalty,
  disinterestRankingWindow,
  disinterestTopicMultiplier,
  DISINTEREST_RANKING_WINDOW,
  DISINTEREST_TOPIC_PENALTY,
  MIN_DISINTEREST_TOPIC_MULTIPLIER,
  topicPenaltiesFromCounts,
} from './disinterests'

describe('disinterestTopicMultiplier', () => {
  it('leaves a topic alone when nothing in it was marked', () => {
    expect(disinterestTopicMultiplier(0)).toBe(1)
  })

  it('halves the topic per marked market', () => {
    expect(disinterestTopicMultiplier(1)).toBe(DISINTEREST_TOPIC_PENALTY)
    expect(disinterestTopicMultiplier(2)).toBe(
      Math.pow(DISINTEREST_TOPIC_PENALTY, 2)
    )
  })

  it('stops at the floor, so a topic is weighed down but never blocked', () => {
    expect(disinterestTopicMultiplier(50)).toBe(
      MIN_DISINTEREST_TOPIC_MULTIPLIER
    )
    expect(MIN_DISINTEREST_TOPIC_MULTIPLIER).toBeGreaterThan(0)
  })

  it('treats a bad count as no marks rather than poisoning the ranking', () => {
    expect(disinterestTopicMultiplier(NaN)).toBe(1)
    expect(disinterestTopicMultiplier(-3)).toBe(1)
    expect(disinterestTopicMultiplier(Infinity)).toBe(1)
  })

  it('only counts whole markets', () => {
    expect(disinterestTopicMultiplier(1.9)).toBe(DISINTEREST_TOPIC_PENALTY)
  })
})

describe('applyDisinterestTopicPenalty', () => {
  const prior = 0.35

  it('scales topics the user already has a score for', () => {
    expect(
      applyDisinterestTopicPenalty({ nfl: 0.8, nba: 0.6 }, { nfl: 1 }, prior)
    ).toEqual({ nfl: 0.4, nba: 0.6 })
  })

  it('starts an unknown topic from the prior so it ranks below topics nothing was said about', () => {
    const adjusted = applyDisinterestTopicPenalty(
      { nba: 0.6 },
      { nfl: 2 },
      prior
    )
    expect(adjusted.nba).toBe(0.6)
    expect(adjusted.nfl).toBeCloseTo(prior * 0.25, 10)
  })

  it('keeps a blocked topic at zero', () => {
    expect(applyDisinterestTopicPenalty({ nfl: 0 }, { nfl: 3 }, prior)).toEqual(
      { nfl: 0 }
    )
  })

  it('falls back to the prior for a corrupt score', () => {
    const adjusted = applyDisinterestTopicPenalty(
      { nfl: NaN },
      { nfl: 1 },
      prior
    )
    expect(adjusted.nfl).toBeCloseTo(prior * 0.5, 10)
  })

  it('does nothing for a topic with no effective marks', () => {
    expect(
      applyDisinterestTopicPenalty({ nfl: 0.8 }, { nfl: 0, nba: -1 }, prior)
    ).toEqual({ nfl: 0.8 })
  })

  it('never mutates the input, which may be a shared cache', () => {
    const cached = { nfl: 0.8 }
    const counts = { nfl: 1 }
    applyDisinterestTopicPenalty(cached, counts, prior)
    expect(cached).toEqual({ nfl: 0.8 })
    expect(counts).toEqual({ nfl: 1 })
  })
})

describe('disinterestRankingWindow', () => {
  it('re-ranks at least the fixed window so the pages of one visit agree', () => {
    expect(disinterestRankingWindow(3, 0)).toBe(DISINTEREST_RANKING_WINDOW)
    expect(disinterestRankingWindow(20, 150)).toBe(DISINTEREST_RANKING_WINDOW)
  })

  it('grows only when a page reaches past the window', () => {
    expect(disinterestRankingWindow(20, 300)).toBe(320)
  })

  it('treats a bad page as the start rather than shrinking the window', () => {
    expect(disinterestRankingWindow(NaN, -5)).toBe(DISINTEREST_RANKING_WINDOW)
    expect(disinterestRankingWindow(Infinity, 0)).toBe(
      DISINTEREST_RANKING_WINDOW
    )
  })
})

describe('topicPenaltiesFromCounts', () => {
  it('keeps only the topics the marks change, as parallel arrays for unnest', () => {
    expect(topicPenaltiesFromCounts({ nfl: 1, golf: 3, nba: 0 })).toEqual({
      topicIds: ['nfl', 'golf'],
      multipliers: [0.5, 0.125],
    })
  })

  it('is undefined when nothing would change, so a query can stay as it was', () => {
    expect(topicPenaltiesFromCounts({})).toBeUndefined()
    expect(topicPenaltiesFromCounts({ nfl: 0, nba: NaN })).toBeUndefined()
  })
})
