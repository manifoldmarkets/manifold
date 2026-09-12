import { ContractMetric } from '../contract-metric'
import { getOrderedContractMetricRowsForContractId } from './contract-metrics'
import {
  getVersusPositionMetrics,
  getVersusPositionUsers,
} from './versus-positions'
import { createClient, Row } from './utils'

const metricRow = (
  userId: string,
  answerId: string | null,
  yes: number,
  no: number,
  contractId = 'versus'
) =>
  ({
    user_id: userId,
    answer_id: answerId,
    contract_id: contractId,
    has_shares: yes > 0 || no > 0,
    has_yes_shares: yes >= 1,
    has_no_shares: no >= 1,
    total_shares_yes: yes,
    total_shares_no: no,
    data: {
      userId,
      answerId,
      contractId,
      totalShares: { YES: yes, NO: no },
    },
  } as unknown as Row<'user_contract_metrics'>)

// Exercise the real Supabase query builder against an in-memory HTTP response.
// This keeps answer/outcome filters and PostgREST pagination part of the tests.
function metricsDb(rows: Row<'user_contract_metrics'>[]) {
  const requests: URL[] = []
  const db = createClient('http://localhost:54321', 'test-key', {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input))
        requests.push(url)
        let matching = rows.filter((row) =>
          [...url.searchParams].every(([key, value]) => {
            const field = row[key as keyof typeof row]
            if (value.startsWith('eq.')) return String(field) === value.slice(3)
            if (value.startsWith('in.'))
              return value.slice(4, -1).split(',').includes(String(field))
            if (value === 'is.null') return field === null
            return true
          })
        )
        const order = url.searchParams.get('order')?.split(',') ?? []
        matching.sort((a, b) => {
          for (const field of order) {
            const [key, direction] = field.split('.')
            const left = a[key as keyof typeof a] as number | string
            const right = b[key as keyof typeof b] as number | string
            const comparison = left < right ? -1 : left > right ? 1 : 0
            if (comparison)
              return direction === 'desc' ? -comparison : comparison
          }
          return 0
        })
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 1000)
        matching = matching.slice(offset, offset + Math.min(limit, 1000))
        return new Response(JSON.stringify(matching), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  })
  return { db, requests }
}

describe('versus holder pagination', () => {
  it.each([0, 50])(
    'loads all 120 second-answer holders when the first answer has %i holders',
    async (mainCount) => {
      const rows = [
        ...Array.from({ length: mainCount }, (_, i) =>
          metricRow(`main-${i}`, 'home', 200 - i, 0)
        ),
        ...Array.from({ length: 120 }, (_, i) =>
          metricRow(`other-${i}`, 'away', 200 - i, 0)
        ),
        metricRow('summary', null, 1000, 0),
        metricRow('unrelated', 'home', 1000, 0, 'another-market'),
      ]
      const { db } = metricsDb(rows)
      const users = await getVersusPositionUsers('versus', db, 'home', 'away')
      const loaded: ContractMetric[] = []
      for (
        let offset = 0;
        offset < Math.max(users.yes.length, users.no.length);
        offset += 50
      ) {
        const ids = users.yes
          .slice(offset, offset + 50)
          .concat(users.no.slice(offset, offset + 50))
        loaded.push(
          ...(await getVersusPositionMetrics(
            'versus',
            db,
            ['home', 'away'],
            ids
          ))
        )
      }
      expect(loaded).toHaveLength(mainCount + 120)
      expect(new Set(loaded.map((m) => m.userId)).size).toBe(mainCount + 120)
      expect(loaded.some((m) => m.userId === 'other-119')).toBe(true)
    }
  )

  it('preserves single-answer and binary summary queries', async () => {
    const { db } = metricsDb([
      metricRow('home-user', 'home', 20, 0),
      metricRow('away-user', 'away', 0, 30),
      metricRow('binary-user', null, 40, 0),
    ])
    const answerRows = await getOrderedContractMetricRowsForContractId(
      'versus',
      db,
      'away',
      'shares'
    )
    expect(answerRows.map((r) => r.user_id)).toEqual(['away-user'])
    const summaryRows = await getOrderedContractMetricRowsForContractId(
      'versus',
      db,
      undefined,
      'shares'
    )
    expect(summaryRows.map((r) => r.user_id)).toEqual(['binary-user'])
  })
})

describe('versus holder counts', () => {
  it('ranks fractional positions after combining both answers', async () => {
    const { db } = metricsDb([
      metricRow('fractional', 'home', 0.6, 0),
      metricRow('fractional', 'away', 0, 0.6),
    ])
    expect(await getVersusPositionUsers('versus', db, 'home', 'away')).toEqual({
      yes: ['fractional'],
      no: [],
    })
  })

  it('fetches complete metrics only for the selected users', async () => {
    const rows = [
      metricRow('selected', 'home', 0, 0),
      metricRow('selected', 'away', 0, 100),
      metricRow('selected', null, 100, 0),
      metricRow('not-selected', 'home', 1000, 0),
      metricRow('selected', 'home', 1000, 0, 'another-market'),
    ]
    const { db } = metricsDb(rows)
    const metrics = await getVersusPositionMetrics(
      'versus',
      db,
      ['home', 'away'],
      ['selected']
    )
    expect(metrics.map((m) => [m.userId, m.answerId, m.totalShares])).toEqual([
      ['selected', 'home', { YES: 0, NO: 0 }],
      ['selected', 'away', { YES: 0, NO: 100 }],
    ])
  })

  it('does not query details for an empty page', async () => {
    const { db, requests } = metricsDb([])
    expect(
      await getVersusPositionMetrics('versus', db, ['home', 'away'], [])
    ).toEqual([])
    expect(requests).toHaveLength(0)
  })

  it('counts equivalent positions once and matches the table for both-side holders', async () => {
    const { db } = metricsDb([
      metricRow('main-only', 'home', 10, 0),
      metricRow('equivalent-main', 'home', 10, 0),
      metricRow('equivalent-main', 'away', 0, 20),
      metricRow('other-only', 'away', 30, 0),
      metricRow('equivalent-other', 'home', 0, 40),
      metricRow('equivalent-other', 'away', 50, 0),
      metricRow('both', 'home', 10, 0),
      metricRow('both', 'away', 60, 0),
      metricRow('summary', null, 1000, 0),
      metricRow('sold-out', 'home', 0, 0),
      metricRow('unrelated', 'home', 10, 0, 'another-market'),
    ])
    const users = await getVersusPositionUsers('versus', db, 'home', 'away')
    expect(users.yes).toEqual(['equivalent-main', 'both', 'main-only'])
    expect(users.no).toEqual(['equivalent-other', 'other-only'])
  })

  it('continues beyond the database row cap and deduplicates across pages', async () => {
    const rows = Array.from({ length: 1100 }, (_, i) =>
      metricRow(`user-${String(i).padStart(4, '0')}`, 'away', 10, 0)
    )
    // Put two equivalent records on opposite sides of the 1000-row boundary.
    rows.push(metricRow('user-0999', 'home', 0, 20))
    const { db, requests } = metricsDb(rows)
    const users = await getVersusPositionUsers('versus', db, 'home', 'away')
    expect(users.yes).toHaveLength(0)
    expect(users.no).toHaveLength(1100)
    expect(users.no[0]).toBe('user-0999')
    expect(requests.map((r) => r.searchParams.get('offset'))).toEqual([
      '0',
      '1000',
    ])
    expect(
      requests.every((r) => !r.searchParams.get('select')?.includes('data'))
    ).toBe(true)
  })
})
