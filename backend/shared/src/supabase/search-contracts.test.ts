import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  basicSearchSQL,
  getForYouTopicRankSql,
  getSemanticSearchContractSQL,
  shouldSuppressStaleSeenMarkets,
  staleSeenMarketsSql,
} from './search-contracts'
import { renderSql } from './sql-builder'

const semanticSearchArgs = {
  embedding: [0.1, 0.2],
  filter: 'open',
  contractType: 'ALL',
  limit: 4,
  offset: 0,
  sort: 'score',
  token: 'MANA' as const,
}

describe('getForYouTopicRankSql', () => {
  it('keeps the legacy average in control', () => {
    const sql = getForYouTopicRankSql('importance_score', 'control')

    expect(sql).toContain(
      'avg(power(coalesce(uti.avg_conversion_score, 0.34698192227708463), 4) * contracts.importance_score)'
    )
    expect(sql).not.toContain('0.7 * max')
  })

  it('uses the niche blend only in treatment', () => {
    const sql = getForYouTopicRankSql('importance_score', 'treatment')

    expect(sql).toContain('0.7 * max')
    expect(sql).toContain('0.3 * avg')
    expect(sql).toContain('* avg(contracts.importance_score)')
  })

  it('defaults an unversioned caller to control', () => {
    expect(getForYouTopicRankSql('importance_score', undefined)).not.toContain(
      '0.7 * max'
    )
  })
})

describe('getSemanticSearchContractSQL', () => {
  it('keeps the requested limit and excludes lexical results', () => {
    const sql = getSemanticSearchContractSQL({
      ...semanticSearchArgs,
      excludeContractIds: ['lexical-market'],
    })

    expect(sql).toContain('limit 4')
    expect(sql).toContain('contracts.id <> all(')
    expect(sql).toContain('lexical-market')
  })

  it('defensively renders a positive limit', () => {
    const sql = getSemanticSearchContractSQL({
      ...semanticSearchArgs,
      limit: 0,
    })

    expect(sql).toContain('limit 1')
  })

  it('preserves news and has-bets filters', () => {
    const sql = getSemanticSearchContractSQL({
      ...semanticSearchArgs,
      filter: 'news',
      hasBets: '1',
      uid: 'user-id',
    })

    expect(sql).toContain('contract_movement_notifications')
    expect(sql).toContain('recent_movements rm')
    expect(sql).toContain('user_contract_metrics cm')
  })

  it('preserves group filters', () => {
    const sql = getSemanticSearchContractSQL({
      ...semanticSearchArgs,
      groupIds: ['science'],
    })

    expect(sql).toContain('select 1 from group_contracts gc')
    expect(sql).toContain('science')
  })
})

describe('staleSeenMarketsSql', () => {
  const sql = renderSql(staleSeenMarketsSql('user-id'))

  it('only suppresses CPMM mechanisms with a supported movement signal', () => {
    expect(sql).toContain("contracts.mechanism in ('cpmm-1', 'cpmm-multi-1')")
  })

  it('lets resolutions and new or moving answers resurface', () => {
    expect(sql).toContain('contracts.resolution_time')
    expect(sql).toContain('from answers a')
    expect(sql).toContain('a.created_time')
    expect(sql).toContain('a.resolution_time > greatest')
    expect(sql).toContain('a.prob_change_day')
  })

  it('anchors the seen window on server time without a cutoff', () => {
    expect(sql).toContain("between now() - interval '7 days'")
    expect(sql).toContain("and now() - interval '1 hour'")
  })

  it('anchors both bounds of the seen window on the cutoff alone', () => {
    const anchoredSql = renderSql(
      staleSeenMarketsSql('user-id', 1_700_000_000_000)
    )

    expect(anchoredSql).toContain(
      "between millis_to_ts(1700000000000) - interval '7 days'"
    )
    expect(anchoredSql).toContain(
      "and millis_to_ts(1700000000000) - interval '1 hour'"
    )
    expect(anchoredSql).not.toContain('now()')
  })
})

describe('shouldSuppressStaleSeenMarkets', () => {
  const now = 1_700_000_000_000

  it('applies an anchored seen set', () => {
    expect(shouldSuppressStaleSeenMarkets(now, now)).toBe(true)
    expect(shouldSuppressStaleSeenMarkets(now - HOUR_MS, now)).toBe(true)
  })

  it('tolerates request latency and a slightly fast client clock', () => {
    expect(shouldSuppressStaleSeenMarkets(now + MINUTE_MS, now)).toBe(true)
  })

  it('refuses an anchor far ahead of server time', () => {
    expect(shouldSuppressStaleSeenMarkets(now + HOUR_MS, now)).toBe(false)
  })

  it('pins the tolerance at five minutes', () => {
    expect(shouldSuppressStaleSeenMarkets(now + 5 * MINUTE_MS, now)).toBe(true)
    expect(shouldSuppressStaleSeenMarkets(now + 5 * MINUTE_MS + 1, now)).toBe(
      false
    )
  })

  it('never applies without an anchor', () => {
    expect(shouldSuppressStaleSeenMarkets()).toBe(false)
    expect(shouldSuppressStaleSeenMarkets(undefined)).toBe(false)
  })
})

describe('basicSearchSQL', () => {
  const basicSearchArgs = {
    filter: 'open',
    contractType: 'ALL',
    limit: 40,
    offset: 0,
    sort: 'score',
    token: 'MANA' as const,
  }

  it('does not suppress seen markets for ordinary basic browse', () => {
    expect(basicSearchSQL(basicSearchArgs)).not.toContain('user_contract_views')
  })

  it('does not enable fallback suppression without an anchor', () => {
    const sql = basicSearchSQL({
      ...basicSearchArgs,
      uid: 'user-id',
      suppressStaleSeen: true,
    })

    expect(sql).not.toContain('user_contract_views')
  })

  it('can preserve stale-seen behavior for an anchored For You fallback', () => {
    const sql = basicSearchSQL({
      ...basicSearchArgs,
      uid: 'user-id',
      seenMarketCutoffTime: 1_700_000_000_000,
      suppressStaleSeen: true,
    })

    expect(sql).toContain('user_contract_views')
    expect(sql).toContain('millis_to_ts(1700000000000)')
  })

  it('refuses an anchor far ahead of server time', () => {
    const sql = basicSearchSQL({
      ...basicSearchArgs,
      uid: 'user-id',
      seenMarketCutoffTime: Date.now() + HOUR_MS,
      suppressStaleSeen: true,
    })

    expect(sql).not.toContain('user_contract_views')
  })
})
