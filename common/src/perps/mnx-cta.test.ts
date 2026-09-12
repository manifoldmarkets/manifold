import { MNX_INSTRUMENTS } from './mnx'
import {
  MNX_CLICK_EVENT,
  MNX_LINK_LOCATIONS,
  getMnxTradeTarget,
  mnxLinkContent,
  mnxLinkUrl,
} from './mnx-cta'

it('offers every live MNX instrument a target, and nothing else', () => {
  for (const instrument of MNX_INSTRUMENTS)
    expect(getMnxTradeTarget({ oracleFeedId: instrument.feedId })).toBe(
      instrument
    )
  for (const feedId of [undefined, 'btc-usd', 'trump-approval-rating', ''])
    expect(getMnxTradeTarget({ oracleFeedId: feedId })).toBeUndefined()
})

it('withholds the CTA from a settled market, whose instrument may be delisted', () => {
  const oracleFeedId = MNX_INSTRUMENTS[0].feedId
  expect(getMnxTradeTarget({ oracleFeedId, isResolved: false })).toBeDefined()
  expect(getMnxTradeTarget({ oracleFeedId, isResolved: true })).toBeUndefined()
})

it('tags each placement distinguishably, from one event name', () => {
  // The event name and the utm_content are the two halves someone has to
  // join later; neither may drift into something a query would miss.
  expect(MNX_CLICK_EVENT).toBe('click mnx link')
  const contents = MNX_LINK_LOCATIONS.map(mnxLinkContent)
  expect(new Set(contents).size).toBe(MNX_LINK_LOCATIONS.length)
  for (const content of contents) expect(content).toMatch(/^[a-z-]+$/)
  expect(
    mnxLinkUrl('https://app.mnx.fi/trade/anthropic', 'market page cta')
  ).toBe(
    'https://app.mnx.fi/trade/anthropic?utm_source=manifold&utm_medium=referral' +
      '&utm_campaign=perps&utm_content=market-page-cta'
  )
})

it('keeps the instrument page intact while tagging it', () => {
  const tagged = mnxLinkUrl(
    'https://app.mnx.fi/trade/h100?theme=dark#book',
    'perps hub credit'
  )
  const parsed = new URL(tagged)
  expect(parsed.origin + parsed.pathname).toBe('https://app.mnx.fi/trade/h100')
  expect(parsed.hash).toBe('#book')
  expect(parsed.searchParams.get('theme')).toBe('dark')
  expect(parsed.searchParams.get('utm_content')).toBe('perps-hub-credit')
  // Tagging is idempotent: a second pass replaces the params rather than
  // sending two of each.
  expect(mnxLinkUrl(tagged, 'perps hub credit')).toBe(tagged)
  expect(
    new URL(mnxLinkUrl(tagged, 'market page cta')).searchParams.getAll(
      'utm_content'
    )
  ).toEqual(['market-page-cta'])
})

it('never breaks a link it cannot parse', () => {
  expect(mnxLinkUrl('not a url', 'market page cta')).toBe('not a url')
})
