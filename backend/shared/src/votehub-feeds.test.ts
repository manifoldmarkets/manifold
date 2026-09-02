import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { TRUMP_APPROVAL_RULES } from 'common/perps/trump-approval'

import { TRUMP_APPROVAL_FEED_ID } from './oracle'
import { getOracleFeed } from './oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_SCHEDULER_EXPECTATIONS,
  getPerpLaunchManifestErrors,
} from './perps/launch-manifest'
import {
  ALL_VOTEHUB_FEED_SPECS,
  GENERIC_BALLOT_2026_SPEC,
  TRUMP_APPROVAL_SPEC,
  VANCE_FAVORABILITY_SPEC,
  VOTEHUB_FEED_SPECS,
  getVoteHubFeedSpec,
} from './votehub-feeds'

// The spec table is the one place a VoteHub feed is defined; everything else
// (registry, attribution, chart decoration, launch manifest) is keyed on the
// feed id and has to exist for the feed to be usable. These tests make a
// missing entry a red build rather than a runtime surprise.
describe('VoteHub feed specs', () => {
  it('every spec is wired end to end', () => {
    for (const spec of ALL_VOTEHUB_FEED_SPECS) {
      const feed = getOracleFeed(spec.feedId)
      expect([spec.feedId, feed?.cadence]).toEqual([spec.feedId, 'daily'])
      expect([spec.feedId, feed?.marketCreationEnabled]).toEqual([
        spec.feedId,
        true,
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
      // A percentage on the chart axis.
      expect([spec.feedId, ORACLE_TICK_DECORATIONS[spec.feedId]]).toEqual([
        spec.feedId,
        { suffix: '%' },
      ])
      const market = PERP_LAUNCH_MARKETS.find((m) => m.feedId === spec.feedId)
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

  it('has a spec for every feed the job publishes, and no duplicates', () => {
    const ids = ALL_VOTEHUB_FEED_SPECS.map((spec) => spec.feedId)
    expect(new Set(ids).size).toBe(ids.length)
    const keys = ALL_VOTEHUB_FEED_SPECS.map((spec) => spec.averageKey)
    expect(new Set(keys).size).toBe(keys.length)
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
    // And it is NOT published by the generic job.
    expect(VOTEHUB_FEED_SPECS).not.toContain(TRUMP_APPROVAL_SPEC)
  })

  it('the new feeds alert under [votehub] and never publish a margin', () => {
    for (const spec of VOTEHUB_FEED_SPECS) {
      expect(spec.logPrefix).toBe('[votehub]')
      expect(spec.tz).toBe('America/Los_Angeles')
      // Their rules are copies, not the Trump object, so a per-spec
      // adjustment cannot leak into the Trump feed.
      expect(spec.rules).not.toBe(TRUMP_APPROVAL_RULES)
      expect(spec.rules).toEqual(TRUMP_APPROVAL_RULES)
    }
    expect(GENERIC_BALLOT_2026_SPEC.answerKey).toBe('dem')
    expect(GENERIC_BALLOT_2026_SPEC.pollType).toBe('generic-ballot')
    expect(GENERIC_BALLOT_2026_SPEC.subject).toBe('2026')
    expect(VANCE_FAVORABILITY_SPEC.answerKey).toBe('favorable')
    expect(VANCE_FAVORABILITY_SPEC.pollType).toBe('favorability')
    expect(VANCE_FAVORABILITY_SPEC.subject).toBe('JD Vance')
    expect(VANCE_FAVORABILITY_SPEC.pollAnswerChoice).toBe('Favorable')
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
