import { MNX_INSTRUMENTS } from './mnx'
import {
  MNX_CLICK_EVENT,
  MNX_LINK_LOCATIONS,
  getMnxTradeTarget,
  mnxLinkContent,
  mnxLinkUrl,
  mnxNavigationHref,
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

it('encodes signed usernames without changing the destination or referral tags', () => {
  const invite = {
    username: 'a+b &雪',
    token: '5cdf54ab0c52493c296c73a4b9259add',
  }
  const url = mnxLinkUrl(
    'https://app.mnx.fi/trade/anthropic?theme=dark&u=old&t=old#book',
    'market page cta',
    invite
  )
  const parsed = new URL(url)
  expect(parsed.searchParams.getAll('u')).toEqual([invite.username])
  expect(parsed.searchParams.getAll('t')).toEqual([invite.token])
  expect(parsed.searchParams.get('theme')).toBe('dark')
  expect(parsed.searchParams.get('utm_source')).toBe('manifold')
  expect(parsed.hash).toBe('#book')
  expect(mnxLinkUrl(url, 'market page cta', invite)).toBe(url)
})

describe('MNX navigation', () => {
  const instrument = MNX_INSTRUMENTS[0]
  const location = MNX_LINK_LOCATIONS[0]
  const url = mnxLinkUrl(instrument.url, location)
  const inviteUrl = mnxLinkUrl(instrument.url, location, {
    username: 'Alice',
    token: 'signed-token',
  })
  const props = {
    url,
    feedId: instrument.feedId,
    location,
    isNative: true,
    authorized: true,
    inviteUrl,
  }

  it.each([false, true])(
    'gives signed-in users a direct invite URL (native: %s)',
    (isNative) => {
      for (const instrument of MNX_INSTRUMENTS) {
        for (const location of MNX_LINK_LOCATIONS) {
          const signed = mnxLinkUrl(instrument.url, location, {
            username: 'Alice',
            token: 'signed-token',
          })
          const href = mnxNavigationHref({
            ...props,
            isNative,
            feedId: instrument.feedId,
            location,
            inviteUrl: signed,
          })
          expect(href).toBe(signed)
          expect(new URL(href!).origin).toBe('https://app.mnx.fi')
        }
      }
    }
  )

  it('waits through a fresh WebView auth handoff before exposing the invite', () => {
    const loading = { ...props, inviteUrl: undefined }
    expect([
      mnxNavigationHref({ ...loading, authorized: undefined }),
      // Firebase initially reports no user before native transfers its session.
      mnxNavigationHref({ ...loading, authorized: false }),
      mnxNavigationHref({ ...loading, authorized: undefined }),
      mnxNavigationHref({ ...loading, authorized: true }),
      mnxNavigationHref(props),
    ]).toEqual([undefined, undefined, undefined, undefined, inviteUrl])
  })

  it('withholds native links during auth or signing, including signing failures', () => {
    expect(mnxNavigationHref({ ...props, authorized: false })).toBeUndefined()
    expect(
      mnxNavigationHref({ ...props, authorized: undefined })
    ).toBeUndefined()
    expect(
      mnxNavigationHref({ ...props, inviteUrl: undefined })
    ).toBeUndefined()
  })

  it('withholds signed-in browser links until the invite is ready', () => {
    expect(
      mnxNavigationHref({ ...props, isNative: false, inviteUrl: undefined })
    ).toBeUndefined()
  })

  it('keeps the signed-out browser redirect and untracked links unchanged', () => {
    const href = mnxNavigationHref({
      ...props,
      isNative: false,
      authorized: false,
    })
    const redirect = new URL(href!, 'https://manifold.markets')
    expect(redirect.pathname).toBe('/mnx')
    expect(redirect.searchParams.get('feedId')).toBe(instrument.feedId)
    expect(redirect.searchParams.get('location')).toBe(location)
    expect(mnxNavigationHref({ ...props, location: undefined })).toBe(url)
    expect(mnxNavigationHref({ ...props, feedId: 'btc-usd' })).toBe(url)
  })
})
