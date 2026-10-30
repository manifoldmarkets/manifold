jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  log: { warn: jest.fn(), error: jest.fn() },
}))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
}))

import { Request } from 'express'
import { API } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import {
  DISINTEREST_RANKING_WINDOW,
  DISINTEREST_TOPIC_WINDOW_DAYS,
  MAX_NEAR_DUPLICATES_PER_DISINTEREST,
  NEAR_DUPLICATE_CANDIDATE_LIMIT,
  NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
} from 'common/disinterests'
import { GROUP_SCORE_PRIOR } from 'common/feed'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  getMarketUninterestedStatus,
  setMarketUninterested,
} from 'api/update-user-disinterests'
import { createSupabaseDirectClient } from './supabase/init'
import { renderSql } from './supabase/sql-builder'
import {
  trendingContractsForUserSql,
  trendingContractsSql,
} from './supabase/trending-contracts'
import {
  applyUserDisinterestsToTopicScores,
  getDisinterestTopicPenalties,
  hideNearDuplicatesOfNewContract,
  hideUninterestedMarketsSql,
  isContractUninterested,
  rankWithDisinterestPenalty,
  setContractUninterested,
} from './supabase/user-disinterests'

type Call = { sql: string; args: unknown[] }
type CreatorRow = { creator_id: string } | null

// Just enough of pg-promise to see which statements run, with what, and
// whether they ran inside the transaction.
const makeDb = (
  opts: { oneOrNoneRow?: CreatorRow; manyOrNoneRows?: unknown[] } = {}
) => {
  const calls: Call[] = []
  const record = (sql: string, args: unknown[]) =>
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), args })
  const tx = {
    none: jest.fn(async (sql: string, args: unknown[]) => {
      record(sql, args)
      // Match pg-promise's row-count contract: SELECT set_config returns a
      // row, so passing it to none() would abort the whole mark transaction.
      if (/^select\s/i.test(sql.trim())) {
        throw new Error('No return data was expected.')
      }
    }),
    one: jest.fn(async (sql: string, args: unknown[]) => {
      record(sql, args)
      return { set_config: args[0] }
    }),
    oneOrNone: jest.fn(
      async (sql: string, args: unknown[], cb?: (r: CreatorRow) => unknown) => {
        record(sql, args)
        const row =
          opts.oneOrNoneRow === undefined
            ? { creator_id: 'creator' }
            : opts.oneOrNoneRow
        return cb ? cb(row) : row
      }
    ),
    manyOrNone: jest.fn(async (sql: string, args: unknown[]) => {
      record(sql, args)
      return opts.manyOrNoneRows ?? []
    }),
  }
  const pg = {
    ...tx,
    tx: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  return { pg, tx, calls }
}
type Db = Parameters<typeof setContractUninterested>[0]
const asDb = (pg: ReturnType<typeof makeDb>['pg']) => pg as unknown as Db
const asClient = (pg: ReturnType<typeof makeDb>['pg']) =>
  pg as unknown as ReturnType<typeof createSupabaseDirectClient>

const MARK_SQL =
  'insert into user_disinterests (user_id, contract_id, creator_id) values'

describe('setContractUninterested', () => {
  test('marking writes one idempotent row and hides open near-duplicates in the same transaction', async () => {
    const { pg, calls } = makeDb({
      manyOrNoneRows: [{ contract_id: 'dup1' }, { contract_id: 'dup2' }],
    })

    const result = await setContractUninterested(asDb(pg), 'u', 'c', true)

    expect(result).toEqual({ uninterested: true, hiddenSimilarCount: 2 })
    expect(pg.tx).toHaveBeenCalledTimes(1)

    const mark = calls.find((c) => c.sql.startsWith(MARK_SQL))
    expect(mark?.args).toEqual(['u', 'c', 'creator'])
    // A second click must never add a row, and a hide the system derived
    // earlier is promoted to a mark the user owns.
    expect(mark?.sql).toContain(
      'on conflict (user_id, contract_id) do update set source_contract_id = null'
    )

    const widen = calls.find((c) => c.sql.includes('set_config'))
    expect(widen?.args).toEqual([String(NEAR_DUPLICATE_CANDIDATE_LIMIT)])

    const similar = calls.find((c) =>
      c.sql.includes('source_contract_id) select')
    )
    expect(similar?.args).toEqual([
      'u',
      'c',
      NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
      NEAR_DUPLICATE_CANDIDATE_LIMIT,
      MAX_NEAR_DUPLICATES_PER_DISINTEREST,
    ])
    expect(similar?.sql).toContain(
      'on conflict (user_id, contract_id) do nothing'
    )
    // Only markets a feed could still show are worth a row.
    expect(similar?.sql).toContain('c.resolution_time is null')
    expect(similar?.sql).toContain('c.close_time > now()')
  })

  test('a market that does not exist is a 404, not a dangling row', async () => {
    const { pg, calls } = makeDb({ oneOrNoneRow: null })

    await expect(
      setContractUninterested(asDb(pg), 'u', 'missing', true)
    ).rejects.toMatchObject({ code: 404 })
    expect(calls.some((c) => c.sql.startsWith('insert into'))).toBe(false)
  })

  test('undo locks the mark, then deletes it and everything derived from it in a fresh statement', async () => {
    const { pg, calls } = makeDb()

    const result = await setContractUninterested(asDb(pg), 'u', 'c', false)

    expect(result).toEqual({ uninterested: false, hiddenSimilarCount: 0 })
    expect(pg.tx).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    // Waiting on the mark's row lock is what lets the delete see hides a
    // concurrent new-market propagation derived from it.
    expect(calls[0].sql).toContain('for update')
    expect(calls[0].args).toEqual(['u', 'c'])
    // The delete must be its own statement after that wait: a statement's
    // snapshot is fixed when it starts, so one combined statement would skip
    // rows committed while it waited.
    expect(calls[1].sql).toContain('delete from user_disinterests')
    expect(calls[1].sql).toContain(
      '(contract_id = $2 or source_contract_id = $2)'
    )
    expect(calls[1].args).toEqual(['u', 'c'])
  })
})

describe('isContractUninterested', () => {
  test('counts both a mark and a derived hide, since either is hiding the market', async () => {
    const hidden = makeDb({ oneOrNoneRow: { creator_id: 'irrelevant' } })
    const shown = makeDb({ oneOrNoneRow: null })

    expect(await isContractUninterested(asDb(hidden.pg), 'u', 'c')).toBe(true)
    expect(await isContractUninterested(asDb(shown.pg), 'u', 'c')).toBe(false)
    expect(hidden.calls[0].args).toEqual(['u', 'c'])
  })
})

describe('hideNearDuplicatesOfNewContract', () => {
  test('hides a public new market for every user who marked a near-identical one', async () => {
    const { pg, calls } = makeDb({
      manyOrNoneRows: [{ user_id: 'a' }, { user_id: 'b' }],
    })

    const hiddenFor = await hideNearDuplicatesOfNewContract(asDb(pg), {
      id: 'new',
      creatorId: 'author',
      visibility: 'public',
    })

    expect(hiddenFor).toBe(2)
    // The same widened index lookup as a mark, inside one transaction.
    expect(pg.tx).toHaveBeenCalledTimes(1)
    expect(calls[0].sql).toContain('set_config')
    expect(calls[1].args).toEqual([
      'new',
      'author',
      NEAR_DUPLICATE_SIMILARITY_THRESHOLD,
      NEAR_DUPLICATE_CANDIDATE_LIMIT,
    ])
    // Derived from the users' own marks only, never chained off another
    // hide, and never hidden from its own creator.
    expect(calls[1].sql).toContain('ud.source_contract_id is null')
    expect(calls[1].sql).toContain('ud.user_id <> $2')
    expect(calls[1].sql).toContain(
      'on conflict (user_id, contract_id) do nothing'
    )
    // The source marks are locked, in one fixed order, before any hide is
    // derived from them, so a concurrent Undo of a source either waits and
    // then sees the new hide, or has already removed the mark these rows
    // would have come from.
    expect(calls[1].sql).toContain('with locked_sources as materialized')
    expect(calls[1].sql).toContain(
      'order by ud.user_id, ud.contract_id for key share of ud'
    )
    expect(calls[1].sql).toContain(
      'select distinct on (user_id) user_id, $1, $2, contract_id from locked_sources'
    )
  })

  test('leaves unlisted markets alone without touching the database', async () => {
    const { pg, calls } = makeDb()

    const hiddenFor = await hideNearDuplicatesOfNewContract(asDb(pg), {
      id: 'new',
      creatorId: 'author',
      visibility: 'unlisted',
    })

    expect(hiddenFor).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('applyUserDisinterestsToTopicScores', () => {
  test('weighs down the topics of recently marked markets, from the prior when the user has no score', async () => {
    const { pg, calls } = makeDb({
      manyOrNoneRows: [
        { group_id: 'nfl', n: 1 },
        { group_id: 'golf', n: 3 },
      ],
    })
    const cached = { nfl: 0.8, nba: 0.6 }

    const adjusted = await applyUserDisinterestsToTopicScores(
      asDb(pg),
      'u',
      cached
    )

    expect(adjusted.nfl).toBeCloseTo(0.4, 10)
    expect(adjusted.nba).toBe(0.6)
    expect(adjusted.golf).toBeCloseTo(GROUP_SCORE_PRIOR * 0.125, 10)
    expect(cached).toEqual({ nfl: 0.8, nba: 0.6 })
    expect(calls[0].args).toEqual(['u', DISINTEREST_TOPIC_WINDOW_DAYS])
    // Derived hides are consequences of a mark, not a second signal.
    expect(calls[0].sql).toContain('ud.source_contract_id is null')
  })

  test('hands back the cached scores untouched when nothing was marked', async () => {
    const { pg } = makeDb({ manyOrNoneRows: [] })
    const cached = { nfl: 0.8 }

    expect(
      await applyUserDisinterestsToTopicScores(asDb(pg), 'u', cached)
    ).toBe(cached)
  })
})

describe('endpoints', () => {
  test('are signed-in only and the status is never cached', () => {
    expect(API['market/:contractId/uninterested']).toMatchObject({
      method: 'POST',
      authed: true,
    })
    expect(API['market/:contractId/uninterested-status']).toMatchObject({
      method: 'GET',
      authed: true,
      cache: 'private, no-store',
    })
  })

  test('act as the signed-in user', async () => {
    const { pg, calls } = makeDb({ manyOrNoneRows: [] })
    jest.mocked(createSupabaseDirectClient).mockReturnValue(asClient(pg))
    const auth = { uid: 'viewer' } as AuthedUser
    const req = {} as Request

    const marked = await setMarketUninterested(
      { contractId: 'c', uninterested: true },
      auth,
      req
    )
    expect(marked).toEqual({ uninterested: true, hiddenSimilarCount: 0 })
    expect(calls.find((c) => c.sql.startsWith(MARK_SQL))?.args).toEqual([
      'viewer',
      'c',
      'creator',
    ])

    const status = await getMarketUninterestedStatus(
      { contractId: 'c' },
      auth,
      req
    )
    expect(status).toEqual({ uninterested: true })
    expect(calls[calls.length - 1].args).toEqual(['viewer', 'c'])
  })

  test('report a missing market as a 404 API error', async () => {
    const { pg } = makeDb({ oneOrNoneRow: null })
    jest.mocked(createSupabaseDirectClient).mockReturnValue(asClient(pg))

    await expect(
      setMarketUninterested(
        { contractId: 'missing', uninterested: true },
        { uid: 'viewer' } as AuthedUser,
        {} as Request
      )
    ).rejects.toBeInstanceOf(APIError)
  })
})

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim()

describe('getDisinterestTopicPenalties', () => {
  test('turns recent marks into multipliers, and no marks into undefined', async () => {
    const marked = makeDb({
      manyOrNoneRows: [
        { group_id: 'nfl', n: 1 },
        { group_id: 'golf', n: 3 },
      ],
    })
    expect(await getDisinterestTopicPenalties(asDb(marked.pg), 'u')).toEqual({
      topicIds: ['nfl', 'golf'],
      multipliers: [0.5, 0.125],
    })
    const quiet = makeDb({ manyOrNoneRows: [] })
    expect(await getDisinterestTopicPenalties(asDb(quiet.pg), 'u')).toBe(
      undefined
    )
  })
})

describe('hideUninterestedMarketsSql', () => {
  test('drops marked and derived hides alike from a query over contracts', () => {
    expect(squash(renderSql(hideUninterestedMarketsSql('u')))).toContain(
      "not exists (select 1 from user_disinterests ud where ud.user_id = 'u' and ud.contract_id = contracts.id)"
    )
  })
})

describe('rankWithDisinterestPenalty', () => {
  const penalties = { topicIds: ['nfl', 'golf'], multipliers: [0.5, 0.125] }

  test('re-ranks the candidate window by its most penalized topic, raw score second', () => {
    const sql = squash(
      rankWithDisinterestPenalty({
        candidatesSql:
          'select id, importance_score from contracts order by importance_score desc limit 200',
        scoreColumn: 'importance_score',
        penalties,
        limit: 3,
        offset: 6,
      })
    )
    expect(sql).toContain(
      'with candidates as (select id, importance_score from contracts order by importance_score desc limit 200)'
    )
    expect(sql).toContain(
      "unnest(array['nfl','golf']::text[], array[0.5,0.125]::float8[]) as p(group_id, multiplier)"
    )
    expect(sql).toContain(
      'select gc.contract_id, min(p.multiplier) as multiplier'
    )
    expect(sql).toContain('where gc.contract_id in (select id from candidates)')
    expect(sql).toContain('left join penalized p on p.contract_id = c.id')
    expect(sql).toContain(
      'order by c.importance_score * coalesce(p.multiplier, 1) desc, c.importance_score desc, c.id'
    )
    expect(sql).toMatch(/limit 3 offset 6$/)
  })

  test('penalizes whichever score the page is sorted by', () => {
    const sql = squash(
      rankWithDisinterestPenalty({
        candidatesSql: 'select id, freshness_score from contracts limit 200',
        scoreColumn: 'freshness_score',
        penalties,
        limit: 20,
        offset: 0,
      })
    )
    expect(sql).toContain(
      'order by c.freshness_score * coalesce(p.multiplier, 1) desc, c.freshness_score desc, c.id'
    )
    expect(sql).toMatch(/limit 20$/)
  })
})

describe('trendingContractsForUserSql', () => {
  test('without recent marks is the plain trending query minus hidden markets', async () => {
    const { pg } = makeDb({ manyOrNoneRows: [] })
    const sql = squash(await trendingContractsForUserSql(asDb(pg), 'u', 3, 6))
    expect(sql).toBe(
      squash(
        trendingContractsSql({ limit: 3, offset: 6, hideUninterestedFor: 'u' })
      )
    )
    expect(sql).toContain("ud.user_id = 'u'")
    expect(sql).toContain('order by importance_score desc limit 3 offset 6')
    expect(sql).not.toContain('with candidates')
  })

  test('with recent marks re-ranks a fixed window of the top candidates, then pages through it', async () => {
    const { pg } = makeDb({ manyOrNoneRows: [{ group_id: 'nfl', n: 2 }] })
    const sql = squash(await trendingContractsForUserSql(asDb(pg), 'u', 3, 6))
    expect(sql).toContain(
      `order by importance_score desc limit ${DISINTEREST_RANKING_WINDOW})`
    )
    expect(sql).toContain("ud.user_id = 'u'")
    expect(sql).toContain("array['nfl']::text[], array[0.25]::float8[]")
    expect(sql).toMatch(/limit 3 offset 6$/)
  })

  test('the signed-out trending query carries no per-user clause at all', () => {
    expect(trendingContractsSql({ limit: 3, offset: 0 })).not.toContain(
      'user_disinterests'
    )
  })
})
