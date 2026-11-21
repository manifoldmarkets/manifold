import { PGlite } from '@electric-sql/pglite'
import { PrivateUser } from 'common/user'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'
import {
  basicSearchSQL,
  getForYouSQL,
  getForYouTopicRankSql,
  getSemanticSearchContractSQL,
  shouldSuppressStaleSeenMarkets,
  staleSeenMarketsSql,
} from './search-contracts'
import { renderSql } from './sql-builder'

// getForYouSQL reads the page-one score thresholds from the database once per
// process. Pin both at 0.1; everything else it renders runs against PGlite.
jest.mock('./init', () => ({
  ...jest.requireActual('./init'),
  createSupabaseDirectClient: () => ({
    one: async (
      _sql: string,
      _params: unknown,
      pick: (row: Record<string, number>) => number
    ) => pick({ importance_score: 0.1, freshness_score: 0.1 }),
  }),
}))

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
    expect(sql).toContain(
      "contracts.mechanism in ('cpmm-1', 'cpmm-multi-1', 'cpmm-multi-2')"
    )
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

  it('does not suppress stale-seen markets on the Your bets lookup surface', () => {
    const sql = basicSearchSQL({
      ...basicSearchArgs,
      uid: 'user-id',
      hasBets: '1',
      seenMarketCutoffTime: 1_700_000_000_000,
      suppressStaleSeen: true,
    })

    expect(sql).toContain('user_contract_metrics')
    expect(sql).not.toContain('user_contract_views')
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

describe('getForYouSQL topic joins', () => {
  const sqlFor = (offset: number) =>
    getForYouSQL({
      uid: 'shape-user',
      filter: 'open',
      contractType: 'ALL',
      limit: 40,
      offset,
      sort: 'score',
      token: 'MANA',
    })

  beforeAll(() => {
    userIdsToAverageTopicConversionScores['shape-user'] = { 'topic-a': 0.5 }
  })

  it('left joins topics so a market without any keeps its row', async () => {
    const sql = await sqlFor(0)
    expect(sql).toContain(
      'left join group_contracts on contracts.id = group_contracts.contract_id left join (select'
    )
    expect(sql).not.toMatch(/(^|\n)join group_contracts/)
  })

  it('keys the topic scores on a non-strict expression', async () => {
    // Pins the planner guard described next to the join.
    expect(await sqlFor(0)).toContain(
      "as uti on uti.group_id = coalesce(group_contracts.group_id, '')"
    )
  })
})

describe('getForYouSQL against PostgreSQL', () => {
  // The rendered For You query runs on PGlite against these markets. A
  // market's rank is its importance times a topic weight: power(score, 4) when
  // the reader has a score for one of its topics, GROUP_SCORE_PRIOR (0.347)
  // when the reader has none, then x1.2 for a followed creator. Importances
  // are spaced so no two markets tie.
  const READER = 'reader'
  const markets: {
    id: string
    topics: string[]
    importance: number
    creator?: string
    resolved?: boolean
  }[] = [
    { id: 'tagged-liked', topics: ['liked'], importance: 0.6 }, // 0.394
    { id: 'blocked-topic', topics: ['blocked', 'liked'], importance: 0.9 }, // 0.295
    { id: 'unscored-hi', topics: ['unscored'], importance: 0.51 }, // 0.177
    { id: 'untagged', topics: [], importance: 0.5 }, // 0.173
    { id: 'unscored-lo', topics: ['unscored'], importance: 0.49 }, // 0.170
    {
      id: 'untagged-blocked-creator',
      topics: [],
      importance: 0.45,
      creator: 'blocked-creator',
    }, // 0.156
    {
      id: 'untagged-followed',
      topics: [],
      importance: 0.3,
      creator: 'followed-creator',
    }, // 0.125 with the follow boost, 0.104 without
    { id: 'untagged-plain', topics: [], importance: 0.33 }, // 0.115
    { id: 'untagged-low', topics: [], importance: 0.05 }, // under the gate
    { id: 'tagged-disliked', topics: ['disliked'], importance: 0.7 }, // 0.00007
    { id: 'untagged-uninterested', topics: [], importance: 0.55 },
    { id: 'untagged-resolved', topics: [], importance: 0.8, resolved: true },
  ]
  const noBlocks = {
    blockedUserIds: [],
    blockedByUserIds: [],
    blockedContractIds: [],
    blockedGroupSlugs: [],
  } as unknown as PrivateUser
  const withBlocks = {
    ...noBlocks,
    blockedUserIds: ['blocked-creator'],
    blockedGroupSlugs: ['blocked-topic-slug'],
  } as unknown as PrivateUser

  let db: PGlite

  const forYou = async (
    args: Partial<Parameters<typeof getForYouSQL>[0]> = {}
  ) => {
    const sql = await getForYouSQL({
      uid: READER,
      filter: 'open',
      contractType: 'ALL',
      limit: 40,
      offset: 0,
      sort: 'score',
      token: 'MANA',
      privateUser: withBlocks,
      ...args,
    })
    const { rows } = await db.query<{ id: string }>(sql)
    return rows.map((r) => r.id)
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create table contracts (
        id text primary key, data jsonb not null default '{}',
        creator_id text not null, importance_score numeric not null,
        freshness_score numeric not null default 0,
        boosted boolean not null default false,
        outcome_type text not null default 'BINARY',
        mechanism text not null default 'cpmm-1',
        visibility text not null default 'public',
        token text not null default 'MANA',
        deleted boolean not null default false,
        is_spice_payout boolean not null default false,
        close_time timestamptz, resolution_time timestamptz
      );
      create table groups (id text primary key, slug text not null);
      create table group_contracts (
        group_id text not null, contract_id text not null,
        primary key (group_id, contract_id)
      );
      create table user_disinterests (user_id text, contract_id text);
      create table user_follows (user_id text, follow_id text);
      create table contract_bets (contract_id text, user_id text);
      create table contract_perp_events (
        contract_id text, user_id text, event_type text
      );
      create table user_contract_metrics (
        user_id text, contract_id text, answer_id text, has_shares boolean
      );
      insert into groups (id, slug) values
        ('liked', 'liked-slug'), ('disliked', 'disliked-slug'),
        ('blocked', 'blocked-topic-slug'), ('unscored', 'unscored-slug');
    `)
    await db.query(
      `insert into user_disinterests values ($1, 'untagged-uninterested')`,
      [READER]
    )
    await db.query(`insert into user_follows values ($1, 'followed-creator')`, [
      READER,
    ])
    for (const m of markets) {
      await db.query(
        `insert into contracts (id, creator_id, importance_score, resolution_time)
         values ($1, $2, $3, $4)`,
        [
          m.id,
          m.creator ?? 'creator',
          m.importance,
          m.resolved ? new Date() : null,
        ]
      )
      for (const topic of m.topics)
        await db.query(
          `insert into group_contracts (group_id, contract_id) values ($1, $2)`,
          [topic, m.id]
        )
    }
    // As buildUserInterestsCache leaves it: scored topics, blocked ones at 0,
    // and no entry for topics the reader never touched.
    userIdsToAverageTopicConversionScores[READER] = {
      liked: 0.9,
      disliked: 0.1,
      blocked: 0,
    }
  })

  afterAll(async () => {
    await db.close()
  })

  it('ranks an untagged market at the prior, like one whose topics have no score', async () => {
    // untagged (0.5) sits between the unscored-topic markets at 0.51 and
    // 0.49: the same weight, not dropped and not boosted.
    expect(await forYou()).toEqual([
      'tagged-liked',
      'unscored-hi',
      'untagged',
      'unscored-lo',
      'untagged-followed',
      'untagged-plain',
      'tagged-disliked',
    ])
  })

  it('ranks untagged markets the same way in the niche-blend arm', async () => {
    expect(await forYou({ discoveryVariant: 'treatment' })).toEqual(
      await forYou({ discoveryVariant: 'control' })
    )
  })

  it('drops blocked topics and creators without dropping untagged markets', async () => {
    const unblocked = await forYou({ privateUser: undefined })
    expect(unblocked).toEqual(
      expect.arrayContaining([
        'blocked-topic',
        'untagged-blocked-creator',
        'untagged',
      ])
    )
    // Empty block lists, as the API passes them for most users, change nothing.
    expect(await forYou({ privateUser: noBlocks })).toEqual(unblocked)

    const blocked = await forYou()
    expect(blocked).not.toContain('blocked-topic')
    expect(blocked).not.toContain('untagged-blocked-creator')
    expect(blocked).toContain('untagged')
  })

  it('keeps disinterest and status filters on untagged markets', async () => {
    const ids = await forYou({ privateUser: undefined })
    expect(ids).not.toContain('untagged-uninterested')
    expect(ids).not.toContain('untagged-resolved')
  })

  it('applies the first-page importance gate to untagged markets like any other', async () => {
    // offset <= threshold / 2 is gated: untagged-low (0.05) is under 0.1.
    expect(await forYou()).not.toContain('untagged-low')
    // Past the gate the full ranking applies, and it appears.
    expect(await forYou({ threshold: 2, offset: 2 })).toEqual([
      'untagged',
      'unscored-lo',
      'untagged-followed',
      'untagged-plain',
      'untagged-low',
      'tagged-disliked',
    ])
  })

  it('lists untagged markets the reader holds shares in on the Your bets view', async () => {
    await db.query(
      `insert into user_contract_metrics values
        ($1, 'untagged', null, true), ($1, 'tagged-liked', null, true)`,
      [READER]
    )
    try {
      expect(await forYou({ hasBets: '1' })).toEqual([
        'tagged-liked',
        'untagged',
      ])
    } finally {
      await db.exec(`delete from user_contract_metrics`)
    }
  })
})
