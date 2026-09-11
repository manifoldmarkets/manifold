import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import {
  MAX_PLAUSIBLE_BOND_GP,
  MIN_PLAUSIBLE_BOND_GP,
  OSRS_BOND_ITEM_ID,
} from 'common/perps/osrs-bond'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { MINUTE_MS } from 'common/util/time'

import { OSRS_BOND_GP_FEED_ID } from './oracle'
import { getMinTradingMarkAgeMs, getOracleFeed } from './oracle-feeds'
import {
  JAGEX_ITEM_DETAIL_URL,
  OSRS_WIKI_BASE_URL,
  OSRS_WIKI_USER_AGENT,
} from './osrs-bond-price'
import { getPerpLaunchManifestErrors } from './perps/launch-manifest'

describe('osrs-bond-gp feed wiring', () => {
  const id = OSRS_BOND_GP_FEED_ID

  it('uses the documented API host, not the wiki article or a tracker site', () => {
    // The price comes from the wiki's real-time prices API. Scraping a
    // third-party tracker (ge-tracker and friends) would mean taking a
    // commercial product's data without its terms, which is the reason MEXC
    // and Gate were dropped from the xStocks feed.
    expect(OSRS_WIKI_BASE_URL).toBe('https://prices.runescape.wiki/api/v1/osrs')
    expect(JAGEX_ITEM_DETAIL_URL).toBe(
      'https://secure.runescape.com/m=itemdb_oldschool/api/catalogue/detail.json'
    )
  })

  it('identifies itself the way the wiki asks automated users to', () => {
    // Their API guidance asks for a User-Agent describing the traffic plus
    // contact info. Stripping this back to a bare product string is exactly
    // what gets a community API's goodwill withdrawn.
    expect(OSRS_WIKI_USER_AGENT).toContain('Manifold')
    expect(OSRS_WIKI_USER_AGENT).toContain('manifold.markets')
    expect(OSRS_WIKI_USER_AGENT).toMatch(/contact/i)
  })

  it('is registered as a fast feed with gp-scaled bounds', () => {
    const feed = getOracleFeed(id)
    expect(feed?.cadence).toBe('fast')
    expect(feed?.marketCreationEnabled).toBe(true)
    // gp, not dollars, and wide enough for the bond's whole traded history
    // (~2M gp in 2015 through the 16.4M high of January 2026).
    expect(feed?.minPrice).toBe(1_000_000)
    expect(feed?.maxPrice).toBe(200_000_000)
    // The registry band must sit inside what the parser considers plausible,
    // or the two disagree about what corrupt means.
    expect(feed?.minPrice).toBeGreaterThanOrEqual(MIN_PLAUSIBLE_BOND_GP)
    expect(feed?.maxPrice).toBeLessThanOrEqual(MAX_PLAUSIBLE_BOND_GP)
  })

  it('tolerates a mark that is minutes old by construction', () => {
    // A point is stamped at its window's END, so it is already ~5 minutes old
    // when published, plus the wiki's own publication lag. Both thresholds
    // have to leave room for that or a perfectly healthy feed reads as stale.
    const feed = getOracleFeed(id)
    expect(feed).toBeDefined()
    if (!feed) return
    expect(feed.updatePeriodMs).toBe(5 * MINUTE_MS)
    expect(feed.staleAfterMs).toBe(30 * MINUTE_MS)
    expect(feed.staleAfterMs).toBeGreaterThan(4 * feed.updatePeriodMs)
    expect(getMinTradingMarkAgeMs(feed)).toBe(10 * MINUTE_MS)
    expect(getMinTradingMarkAgeMs(feed)).toBeGreaterThan(feed.updatePeriodMs)
  })

  it('polls more often than the window turns over, on a whole tick', () => {
    const feed = getOracleFeed(id)
    expect(feed?.pollPeriodMs).toBe(60_000)
    expect((feed?.pollPeriodMs ?? 0) % 2_000).toBe(0)
    expect(feed?.pollPeriodMs).toBeLessThan(feed?.updatePeriodMs ?? 0)
  })

  it('credits the wiki and RuneLite with a link and no unverified licence', () => {
    // Terms not yet read directly — see the note in oracle-attribution.ts. A
    // licence label we cannot quote is worse than none, and reading that page
    // is an operator gate before a market exists on this feed.
    const attribution = getOracleAttribution(id)
    expect(attribution?.source).toBe(
      'OSRS Wiki real-time prices (data contributed via RuneLite)'
    )
    expect(attribution?.url).toBe(
      `https://prices.runescape.wiki/osrs/item/${OSRS_BOND_ITEM_ID}`
    )
    expect(attribution?.licence).toBeUndefined()
    expect(attribution?.licenceUrl).toBeUndefined()
  })

  it('renders in gp, never as a dollar price', () => {
    // A bond is minted for real money, so labelling its gp price with a dollar
    // sign would be actively misleading rather than merely wrong.
    expect(ORACLE_TICK_DECORATIONS[id]).toEqual({ suffix: ' gp' })
    expect(ORACLE_TICK_DECORATIONS[id].prefix).toBeUndefined()
    expect(getPerpFeedTicker(id)).toBe('BOND')
  })

  it('does not disturb the launch manifest', () => {
    expect(getPerpLaunchManifestErrors()).toEqual([])
  })
})
