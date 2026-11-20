import { PGlite } from '@electric-sql/pglite'
import {
  reportSportsKickoffSignal,
  SportsKickoffSignal,
} from './sports-kickoff-signal'

jest.mock('shared/monitoring/log', () => ({ log: { info: jest.fn() } }))

const seed = '2026-02-01T20:00:00.000Z'
const now = Date.parse(seed)
const contractId = 'game'

it('records a start once on the unresolved market and preserves its seed', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      'create table contracts (id text primary key, data jsonb not null, resolution text)'
    )
    await db.query(
      'insert into contracts values ($1, $2, null), ($3, $2, $4)',
      [
        contractId,
        JSON.stringify({ sportsSeededStartTimestamp: seed }),
        'closed',
        'CANCEL',
      ]
    )
    const pg = {
      none: async (sql: string, params: unknown[]) => {
        await db.query(sql, params)
        return null
      },
    }
    const states = async () =>
      (
        await db.query<{ id: string; data: Record<string, unknown> }>(
          'select id, data from contracts order by id'
        )
      ).rows
    const unchanged = await states()
    const signals: SportsKickoffSignal['kind'][] = [
      'missing',
      'canceled',
      'postponed',
      'moved-earlier',
    ]
    for (const kind of signals)
      await reportSportsKickoffSignal(pg, {
        contractId,
        kind,
        observedTime: now,
      })
    expect(await states()).toEqual(unchanged)
    for (const id of [contractId, 'closed'])
      await reportSportsKickoffSignal(pg, {
        contractId: id,
        kind: 'started',
        observedTime: now,
      })
    await reportSportsKickoffSignal(pg, {
      contractId,
      kind: 'started',
      observedTime: now + 1,
    })
    expect(await states()).toEqual([
      unchanged[0],
      {
        id: contractId,
        data: {
          sportsSeededStartTimestamp: seed,
          sportsObservedStartTime: now,
        },
      },
    ])
  } finally {
    await db.close()
  }
}, 30000)

it.each([NaN, Infinity, -1, 1.5])(
  'rejects an invalid observation time %s before writing',
  async (observedTime) => {
    const pg = { none: jest.fn() }
    await expect(
      reportSportsKickoffSignal(pg, {
        contractId,
        kind: 'started',
        observedTime,
      })
    ).rejects.toThrow('Invalid sports kickoff observation time')
    expect(pg.none).not.toHaveBeenCalled()
  }
)
