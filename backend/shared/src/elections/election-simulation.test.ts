import { getAnswerProbability } from 'common/calculate'
import {
  simulateMarket,
  syntheticMarket,
} from '../../../scripts/elections-2026/simulate-election-buys'

test('synthetic election buys retain the production engine and per-answer p', () => {
  const market = syntheticMarket({
    raceKey: 'synthetic-election',
    payload: {
      question: 'Who wins?',
      outcomeType: 'MULTIPLE_CHOICE',
      answers: ['Democratic', 'Republican', 'Other'],
      answerProbs: [15, 70, 15],
      addAnswersMode: 'DISABLED',
      liquidityTier: 1000,
      closeTime: Date.now() + 86_400_000,
    },
  })
  expect(market.mechanism).toBe('cpmm-multi-2')
  const buys = simulateMarket(market, [], {})
  expect(buys).toHaveLength(12)
  for (const buy of buys) {
    expect(buy.error).toBeUndefined()
    expect(buy.probBefore).toBeCloseTo(
      getAnswerProbability(market, buy.answerId),
      4
    )
    expect(buy.shares).toBeGreaterThan(0)
    if (buy.outcome === 'YES')
      expect(buy.probAfter).toBeGreaterThan(buy.probBefore)
    else expect(buy.probAfter).toBeLessThan(buy.probBefore)
  }
})

test('unknown snapshot engines are rejected instead of being treated as v1', () => {
  expect(() => simulateMarket({ mechanism: 'unknown' }, [], {})).toThrow(
    'Unsupported simulation mechanism'
  )
})
