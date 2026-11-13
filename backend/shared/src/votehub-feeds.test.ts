import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { getPerpFeedTicker } from 'common/perps/ticker'
import { TRUMP_APPROVAL_RULES } from 'common/perps/trump-approval'

import {
  TRUMP_APPROVAL_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID,
} from './oracle'
import {
  ORACLE_FEEDS,
  describeOracleFeedLifecycle,
  getOracleFeed,
  isOracleFeedLive,
} from './oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_PENDING_MARKETS,
  PERP_LAUNCH_RETIRED_MARKETS,
  PERP_LAUNCH_SCHEDULER_EXPECTATIONS,
  getPerpLaunchManifestErrors,
} from './perps/launch-manifest'
import { publishVoteHubPoint } from './perps/publish-votehub-average'
import {
  ALL_VOTEHUB_FEED_SPECS,
  GENERIC_BALLOT_2026_SPEC,
  GENERIC_BALLOT_2028_DEM_SPEC,
  GENERIC_BALLOT_2028_REP_SPEC,
  TRUMP_APPROVAL_SPEC,
  VANCE_FAVORABILITY_SPEC,
  VOTEHUB_FEED_SPECS,
  getVoteHubFeedSpec,
} from './votehub-feeds'

// Every reviewed definition, whatever its launch state.
const ALL_MANIFEST_MARKETS = [
  ...PERP_LAUNCH_MARKETS,
  ...PERP_LAUNCH_PENDING_MARKETS,
  ...PERP_LAUNCH_RETIRED_MARKETS,
]

// The spec table is the one place a VoteHub feed is defined; everything else
// (registry, attribution, chart decoration, launch manifest) is keyed on the
// feed id and has to exist for the feed to be usable. These tests make a
// missing entry a red build rather than a runtime surprise.
describe('VoteHub feed specs', () => {
  it('every spec is wired end to end', () => {
    for (const spec of ALL_VOTEHUB_FEED_SPECS) {
      const feed = getOracleFeed(spec.feedId)
      expect([spec.feedId, feed?.cadence]).toEqual([spec.feedId, 'daily'])
      // Creation follows the lifecycle: a live feed is creatable, a retired
      // or not-yet-published one never is.
      expect([spec.feedId, feed?.marketCreationEnabled]).toEqual([
        spec.feedId,
        feed ? isOracleFeedLive(feed) : undefined,
      ])
      // Same CC BY 4.0 credit as the Trump feed, with the licence link that
      // CC BY 4.0 s3(a)(1)(C) asks for.
      const attribution = getOracleAttribution(spec.feedId)
      expect([spec.feedId, attribution?.source]).toEqual([
        spec.feedId,
        'VoteHub',
      ])
      expect([spec.feedId, attribution?.licence]).toEqual([
        spec.feedId,
        'CC BY 4.0',
      ])
      expect([spec.feedId, typeof attribution?.licenceUrl]).toEqual([
        spec.feedId,
        'string',
      ])
      expect([spec.feedId, attribution?.showAsOf]).toEqual([
        spec.feedId,
        undefined,
      ])
      // A percentage on the chart axis, and a ticker for the badge.
      expect([spec.feedId, ORACLE_TICK_DECORATIONS[spec.feedId]]).toEqual([
        spec.feedId,
        { suffix: '%' },
      ])
      expect([spec.feedId, typeof getPerpFeedTicker(spec.feedId)]).toEqual([
        spec.feedId,
        'string',
      ])
      const market = ALL_MANIFEST_MARKETS.find((m) => m.feedId === spec.feedId)
      expect([spec.feedId, market?.oracleBehavior]).toEqual([
        spec.feedId,
        'scheduled-step',
      ])
      expect([spec.feedId, market?.requiresSourceAsOf]).toEqual([
        spec.feedId,
        false,
      ])
    }
  })

  it('has a spec for every feed the job iterates, and no duplicates', () => {
    const ids = ALL_VOTEHUB_FEED_SPECS.map((spec) => spec.feedId)
    expect(new Set(ids).size).toBe(ids.length)
    // Two feeds may share a series (the 2028 ballot's D and R shares) but
    // never a series AND an answer: that would be the same price twice.
    const prices = ALL_VOTEHUB_FEED_SPECS.map(
      (spec) => `${spec.averageKey}/${spec.answerKey}`
    )
    expect(new Set(prices).size).toBe(prices.length)
    for (const spec of VOTEHUB_FEED_SPECS)
      expect(getVoteHubFeedSpec(spec.feedId)).toBe(spec)
    expect(getVoteHubFeedSpec('nope')).toBeUndefined()
  })

  it('keeps the Trump feed exactly as it was', () => {
    // The alert policies key on the feed id and the log prefix; the job name
    // is pinned in the scheduler expectations below.
    expect(TRUMP_APPROVAL_SPEC.feedId).toBe(TRUMP_APPROVAL_FEED_ID)
    expect(TRUMP_APPROVAL_SPEC.feedId).toBe('trump-approval-rating')
    expect(TRUMP_APPROVAL_SPEC.logPrefix).toBe('[trump-approval]')
    expect(TRUMP_APPROVAL_SPEC.averageKey).toBe('trump_approval')
    expect(TRUMP_APPROVAL_SPEC.answerKey).toBe('approve')
    expect(TRUMP_APPROVAL_SPEC.pollType).toBe('approval')
    expect(TRUMP_APPROVAL_SPEC.subject).toBe('Donald Trump')
    expect(TRUMP_APPROVAL_SPEC.pollAnswerChoice).toBe('Approve')
    expect(TRUMP_APPROVAL_SPEC.rules).toBe(TRUMP_APPROVAL_RULES)
    expect(TRUMP_APPROVAL_SPEC.seriesEndsOn).toBeUndefined()
    expect(getOracleFeed(TRUMP_APPROVAL_FEED_ID)?.lifecycle).toBeUndefined()
    // And it is NOT published by the generic job.
    expect(VOTEHUB_FEED_SPECS).not.toContain(TRUMP_APPROVAL_SPEC)
  })

  it('the other feeds alert under [votehub] and never publish a margin', () => {
    for (const spec of VOTEHUB_FEED_SPECS) {
      expect(spec.logPrefix).toBe('[votehub]')
      expect(spec.tz).toBe('America/Los_Angeles')
      // Their rules are copies, not the Trump object, so a per-spec
      // adjustment cannot leak into the Trump feed.
      expect(spec.rules).not.toBe(TRUMP_APPROVAL_RULES)
      expect(spec.rules).toEqual(TRUMP_APPROVAL_RULES)
      // A share: `dem`, `rep`, `favorable` — never a margin key.
      expect(['dem', 'rep', 'favorable']).toContain(spec.answerKey)
    }
    expect(GENERIC_BALLOT_2026_SPEC.answerKey).toBe('dem')
    expect(GENERIC_BALLOT_2026_SPEC.pollType).toBe('generic-ballot')
    expect(GENERIC_BALLOT_2026_SPEC.subject).toBe('2026')
    expect(GENERIC_BALLOT_2026_SPEC.seriesEndsOn).toBe('2026-11-03')
    expect(VANCE_FAVORABILITY_SPEC.answerKey).toBe('favorable')
    expect(VANCE_FAVORABILITY_SPEC.pollType).toBe('favorability')
    expect(VANCE_FAVORABILITY_SPEC.subject).toBe('JD Vance')
    expect(VANCE_FAVORABILITY_SPEC.pollAnswerChoice).toBe('Favorable')
    expect(VANCE_FAVORABILITY_SPEC.seriesEndsOn).toBeUndefined()
  })

  it('the 2028 pair reads one series under the two party keys', () => {
    for (const spec of [
      GENERIC_BALLOT_2028_DEM_SPEC,
      GENERIC_BALLOT_2028_REP_SPEC,
    ]) {
      expect(spec.averageKey).toBe('generic_ballot_2028')
      expect(spec.subject).toBe('2028')
      expect(spec.pollType).toBe('generic-ballot')
      expect(spec.seriesEndsOn).toBe('2028-11-07')
      expect(VOTEHUB_FEED_SPECS).toContain(spec)
    }
    // Verified against the 2026 series and polls on 2026-11-09:
    // `{ dem: { average }, rep: { average } }` and choices `Dem` / `Rep`.
    expect(GENERIC_BALLOT_2028_DEM_SPEC.feedId).toBe(
      VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID
    )
    expect(GENERIC_BALLOT_2028_DEM_SPEC.answerKey).toBe('dem')
    expect(GENERIC_BALLOT_2028_DEM_SPEC.pollAnswerChoice).toBe('Dem')
    expect(GENERIC_BALLOT_2028_REP_SPEC.feedId).toBe(
      VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID
    )
    expect(GENERIC_BALLOT_2028_REP_SPEC.answerKey).toBe('rep')
    expect(GENERIC_BALLOT_2028_REP_SPEC.pollAnswerChoice).toBe('Rep')
    expect(getPerpFeedTicker(VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID)).toBe(
      'DEM28'
    )
    expect(getPerpFeedTicker(VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID)).toBe(
      'GOP28'
    )
  })

  it('pins the registry bounds and launch settings per feed', () => {
    const bounds: Record<string, [number, number]> = {
      'trump-approval-rating': [10, 90],
      'votehub-generic-ballot-2026': [20, 80],
      'votehub-generic-ballot-2028-dem': [20, 80],
      'votehub-generic-ballot-2028-rep': [20, 80],
      'vance-favorability': [10, 90],
    }
    for (const spec of ALL_VOTEHUB_FEED_SPECS) {
      const feed = getOracleFeed(spec.feedId)
      expect([spec.feedId, feed?.minPrice, feed?.maxPrice]).toEqual([
        spec.feedId,
        ...bounds[spec.feedId],
      ])
      expect([spec.feedId, feed?.staleAfterMs]).toEqual([
        spec.feedId,
        26 * 60 * 60 * 1000,
      ])
      expect([spec.feedId, feed?.updatePeriodMs]).toEqual([
        spec.feedId,
        24 * 60 * 60 * 1000,
      ])
      const market = ALL_MANIFEST_MARKETS.find((m) => m.feedId === spec.feedId)
      expect([spec.feedId, market?.recommended]).toEqual([
        spec.feedId,
        {
          maxLeverage: 3,
          annualMaxFundingRate: 1,
          fundingSensitivity: 1,
          maxOraclePriceAgeMs: 30 * 60 * 60 * 1000,
          subsidyLong: 5_000,
          subsidyShort: 5_000,
        },
      ])
      expect([spec.feedId, market?.requiredTopics.map((t) => t.name)]).toEqual([
        spec.feedId,
        ['Politics'],
      ])
    }
  })

  it('both VoteHub jobs are in the launch scheduler expectations', () => {
    const names = PERP_LAUNCH_SCHEDULER_EXPECTATIONS.map((e) => e.jobName)
    expect(names).toContain('update-trump-approval')
    expect(names).toContain('update-votehub-averages')
  })

  it('the launch manifest still validates with the new feeds', () => {
    expect(getPerpLaunchManifestErrors()).toEqual([])
  })
})

// The 2026 generic ballot is the first feed to reach the end of its series
// with a settled market behind it. Until it was marked retired, the publisher
// kept polling the ended series every five minutes and logged an
// un-throttled stale-feed ERROR per attempt, while the hourly dead-man probe
// paged the [oracle-feeds] alert for a market that no longer existed.
describe('VoteHub feed lifecycle', () => {
  const retired = getOracleFeed(VOTEHUB_GENERIC_BALLOT_2026_FEED_ID)
  const awaiting = [
    VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID,
    VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID,
  ].map((id) => getOracleFeed(id))

  it('retires the 2026 generic ballot and parks the 2028 pair', () => {
    expect(retired?.lifecycle?.phase).toBe('retired')
    expect(retired?.marketCreationEnabled).toBe(false)
    expect(retired && isOracleFeedLive(retired)).toBe(false)
    // Retired at the market's settlement, which followed the series' end.
    expect(
      retired?.lifecycle?.phase === 'retired' && retired.lifecycle.at
    ).toBe(Date.UTC(2026, 10, 5, 21, 56, 39))
    for (const feed of awaiting) {
      expect(feed?.lifecycle?.phase).toBe('awaiting-source')
      expect(feed?.marketCreationEnabled).toBe(false)
      expect(feed && isOracleFeedLive(feed)).toBe(false)
    }
    // Everything else in the registry is live.
    for (const feed of ORACLE_FEEDS) {
      if (feed === retired || awaiting.includes(feed)) continue
      expect([feed.id, isOracleFeedLive(feed)]).toEqual([feed.id, true])
    }
  })

  it('mirrors the lifecycle in the launch manifest', () => {
    expect(PERP_LAUNCH_RETIRED_MARKETS.map((m) => m.feedId)).toEqual([
      VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
    ])
    expect(PERP_LAUNCH_PENDING_MARKETS.map((m) => m.feedId).sort()).toEqual(
      [
        VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID,
        VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID,
      ].sort()
    )
    expect(
      PERP_LAUNCH_MARKETS.some(
        (m) => m.feedId === VOTEHUB_GENERIC_BALLOT_2026_FEED_ID
      )
    ).toBe(false)
    for (const market of PERP_LAUNCH_PENDING_MARKETS)
      expect(market.pendingReason).toMatch(/generic_ballot_2028/)
  })

  it('describes each phase in one clause', () => {
    expect(
      describeOracleFeedLifecycle({
        phase: 'retired',
        at: Date.UTC(2026, 10, 5, 21, 56, 39),
        reason: 'series ended',
      })
    ).toBe('retired since 2026-11-05 (series ended)')
    expect(
      describeOracleFeedLifecycle({
        phase: 'awaiting-source',
        reason: 'no key yet',
      })
    ).toBe('awaiting its source (no key yet)')
  })

  it('publishVoteHubPoint declines an inactive feed before any request', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network must not be touched'))
    // No database method exists on this stub: touching it would throw.
    const pg = {} as Parameters<typeof publishVoteHubPoint>[0]
    try {
      const ended = await publishVoteHubPoint(pg, GENERIC_BALLOT_2026_SPEC)
      expect(ended.status).toBe('inactive')
      if (ended.status === 'inactive') {
        expect(ended.phase).toBe('retired')
        expect(ended.reason).toContain('votehub-generic-ballot-2026')
        expect(ended.reason).toContain('retired since 2026-11-05')
      }
      for (const spec of [
        GENERIC_BALLOT_2028_DEM_SPEC,
        GENERIC_BALLOT_2028_REP_SPEC,
      ]) {
        const parked = await publishVoteHubPoint(pg, spec)
        expect(parked.status).toBe('inactive')
        if (parked.status === 'inactive')
          expect(parked.phase).toBe('awaiting-source')
      }
      // The operator escape hatch does not override a lifecycle either: a
      // retired series has nothing to force.
      const forced = await publishVoteHubPoint(pg, GENERIC_BALLOT_2026_SPEC, {
        force: true,
      })
      expect(forced.status).toBe('inactive')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('rejects a spec with no registry entry without a request', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network must not be touched'))
    try {
      const result = await publishVoteHubPoint(
        {} as Parameters<typeof publishVoteHubPoint>[0],
        { ...GENERIC_BALLOT_2026_SPEC, feedId: 'not-registered' }
      )
      expect(result).toEqual({
        status: 'rejected',
        reason: 'missing OracleFeedDef for not-registered',
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
