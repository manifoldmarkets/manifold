import {
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
    expect(sql).toContain('a.prob_change_day')
  })

  it('can anchor the seen window for stable offset pagination', () => {
    const anchoredSql = renderSql(
      staleSeenMarketsSql('user-id', 1_700_000_000_000)
    )

    expect(anchoredSql).toContain('millis_to_ts(1700000000000)')
    expect(anchoredSql).not.toContain('between now()')
  })
})

describe('shouldSuppressStaleSeenMarkets', () => {
  it('uses an anchored seen set on every page', () => {
    expect(shouldSuppressStaleSeenMarkets(40, 1_700_000_000_000)).toBe(true)
  })

  it('limits legacy unanchored callers to the first page', () => {
    expect(shouldSuppressStaleSeenMarkets(0)).toBe(true)
    expect(shouldSuppressStaleSeenMarkets(40)).toBe(false)
  })
})
