import { API } from 'common/api/schema'
import { createMarketProps } from 'common/api/market-types'
import { CREATEABLE_OUTCOME_TYPES } from 'common/contract'

// Perps are priced by an oracle data feed, so a user-created one would have
// nothing to price it. Creation is admin-only (create-perp), and these are the
// gates that keep PERP out of every path an ordinary user can reach.

const baseMarket = {
  question: 'Bitcoin price (USD)',
  liquidityTier: 100,
}

it('does not list PERP as a user-creatable outcome type', () => {
  expect(CREATEABLE_OUTCOME_TYPES).not.toContain('PERP')
})

it('rejects a PERP market from create-market', () => {
  expect(
    createMarketProps.safeParse({ ...baseMarket, outcomeType: 'PERP' }).success
  ).toBe(false)
})

it('still accepts an ordinary market from create-market', () => {
  expect(
    createMarketProps.safeParse({
      ...baseMarket,
      outcomeType: 'BINARY',
      initialProb: 50,
    }).success
  ).toBe(true)
})

// A draft is a market in progress. Saving one with outcomeType PERP used to
// succeed (the field was a free string), which is what made a perp look
// creatable from the new-market form before submit rejected it.
describe('save-market-draft', () => {
  const draft = {
    question: 'Bitcoin price (USD)',
    visibility: 'public',
    selectedGroups: [],
    savedAt: 0,
  }
  const parseDraft = (outcomeType: string) =>
    API['save-market-draft'].props.safeParse({
      data: { ...draft, outcomeType },
    }).success

  it('refuses to save a PERP draft', () => {
    expect(parseDraft('PERP')).toBe(false)
  })

  it('saves a draft for every creatable type', () => {
    for (const outcomeType of CREATEABLE_OUTCOME_TYPES)
      expect(parseDraft(outcomeType)).toBe(true)
  })
})
