import { getContractProfitCounts } from './contract-metrics'
import { createClient, Row } from './utils'

type ProfitMetricRow = Pick<
  Row<'user_contract_metrics'>,
  'user_id' | 'contract_id' | 'answer_id' | 'profit' | 'has_shares'
>

const metric = (
  userId: string,
  profit: number | null,
  extra: Partial<ProfitMetricRow> = {}
): ProfitMetricRow => ({
  user_id: userId,
  contract_id: 'market',
  answer_id: null,
  profit,
  has_shares: true,
  ...extra,
})

function metricsDb(rows: ProfitMetricRow[]) {
  const requests: { url: URL; method: string | undefined; headers: Headers }[] =
    []
  const db = createClient('http://localhost:54321', 'test-key', {
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input))
        requests.push({
          url,
          method: init?.method,
          headers: new Headers(init?.headers),
        })
        const matching = rows.filter((row) =>
          [...url.searchParams].every(([key, value]) => {
            const field = row[key as keyof ProfitMetricRow]
            if (value.startsWith('eq.')) return String(field) === value.slice(3)
            if (value === 'is.null') return field === null
            if (value.startsWith('gt.'))
              return field != null && Number(field) > Number(value.slice(3))
            if (value.startsWith('lt.'))
              return field != null && Number(field) < Number(value.slice(3))
            return true
          })
        )
        return new Response(null, {
          headers: { 'Content-Range': `*/${matching.length}` },
        })
      },
    },
  })
  return { db, requests }
}

describe('getContractProfitCounts', () => {
  it('includes sold-out traders and excludes answer metrics, zero profit, and other markets', async () => {
    const { db, requests } = metricsDb([
      metric('profitable-holder', 10),
      metric('profitable-sold-out', 20, { has_shares: false }),
      metric('losing-holder', -10),
      metric('losing-sold-out', -20, { has_shares: false }),
      metric('profitable-holder', 10, { answer_id: 'home' }),
      metric('losing-holder', -10, { answer_id: 'away' }),
      metric('even-holder', 0),
      metric('unknown-profit', null),
      metric('other-profit', 30, { contract_id: 'another-market' }),
      metric('other-loss', -30, { contract_id: 'another-market' }),
    ])
    expect(await getContractProfitCounts('market', db)).toEqual({
      profit: 2,
      loss: 2,
    })
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.method).toBe('HEAD')
      expect(request.headers.get('Prefer')).toContain('count=exact')
      expect(request.url.searchParams.has('has_shares')).toBe(false)
    }
  })

  it('keeps all profit pages after equivalent holders are deduplicated', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => [
      metric(`holder-${i}`, 10),
      metric(`holder-${i}`, 5, { answer_id: 'home' }),
      metric(`holder-${i}`, 5, { answer_id: 'away' }),
      metric(`sold-out-${i}`, 20, { has_shares: false }),
    ]).flat()
    const { db } = metricsDb(rows)
    expect(await getContractProfitCounts('market', db)).toEqual({
      profit: 60,
      loss: 0,
    })
  })

  it('counts beyond the database response row cap without loading metrics', async () => {
    const { db, requests } = metricsDb([
      ...Array.from({ length: 1500 }, (_, i) => metric(`profit-${i}`, 1)),
      ...Array.from({ length: 1100 }, (_, i) => metric(`loss-${i}`, -1)),
    ])
    expect(await getContractProfitCounts('market', db)).toEqual({
      profit: 1500,
      loss: 1100,
    })
    expect(requests.map((request) => request.method)).toEqual(['HEAD', 'HEAD'])
  })

  it('returns zero counts when there are no ranked traders', async () => {
    const { db } = metricsDb([metric('even-holder', 0)])
    expect(await getContractProfitCounts('market', db)).toEqual({
      profit: 0,
      loss: 0,
    })
  })
})
