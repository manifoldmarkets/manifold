import {
  ConversionScoreDb,
  ConversionScoreTx,
  rescoreConversionScores,
} from './conversion-score'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () => {
    throw new Error('the tests drive the client explicitly')
  },
}))
jest.mock('shared/utils', () => ({ log: () => undefined }))

type Write = { ids: string[]; scores: string[] }

// A database in which `for update skip locked` returns only the unlocked ids,
// which is the whole behaviour under test. Scores are kept as the strings
// postgres would return for an unconstrained numeric.
const fakeDb = (opts: {
  viewedIds: string[]
  scores: Record<string, string>
  lockedIds?: string[]
}) => {
  const locked = new Set(opts.lockedIds ?? [])
  const writes: Write[] = []
  const db: ConversionScoreDb = {
    map: async <T>(
      _query: string,
      _values: unknown[],
      cb: (row: Record<string, any>) => T
    ) => opts.viewedIds.map((id) => cb({ contract_id: id })),
    manyOrNone: async <T>(_query: string, values: unknown[]) =>
      (values[0] as string[])
        .filter((id) => id in opts.scores)
        .map((id) => ({ id, score: opts.scores[id] })) as T[],
    tx: async <T>(cb: (tx: ConversionScoreTx) => Promise<T>) => {
      const tx: ConversionScoreTx = {
        map: async <U>(
          _query: string,
          values: unknown[],
          rowCb: (row: Record<string, any>) => U
        ) =>
          (values[0] as string[])
            .filter((id) => !locked.has(id))
            .map((id) => rowCb({ id })),
        none: async (_query: string, values: unknown[]) => {
          writes.push({
            ids: values[0] as string[],
            scores: values[1] as string[],
          })
          return null
        },
      }
      return cb(tx)
    },
  }
  return { db, writes }
}

const writtenIds = (writes: Write[]) => writes.flatMap((w) => w.ids)

describe('rescoreConversionScores', () => {
  it('retries a locked contract that is never viewed again', async () => {
    // The regression: the candidate query only sees contracts viewed in the
    // last hour, so a contract skipped while locked and then never viewed
    // again would silently keep a stale score forever.
    const scores = { locked1: '0.5632098085888197', free1: '0.25' }

    const run1 = fakeDb({
      viewedIds: ['locked1', 'free1'],
      scores,
      lockedIds: ['locked1'],
    })
    const pending = await rescoreConversionScores(run1.db)

    // While locked it keeps its existing score: no write mentions it.
    expect(writtenIds(run1.writes)).toEqual(['free1'])
    expect(pending).toEqual(['locked1'])

    // Second run: nobody has viewed it since, so the activity window is empty
    // and only the carry-forward can bring it back. The lock has cleared.
    const run2 = fakeDb({ viewedIds: [], scores })
    const stillPending = await rescoreConversionScores(run2.db, pending)

    expect(writtenIds(run2.writes)).toEqual(['locked1'])
    expect(stillPending).toEqual([])
  })

  it('keeps carrying a contract that stays locked', async () => {
    const scores = { locked1: '0.25' }
    let pending = ['locked1']
    for (let run = 0; run < 3; run++) {
      const { db, writes } = fakeDb({
        viewedIds: [],
        scores,
        lockedIds: ['locked1'],
      })
      pending = await rescoreConversionScores(db, pending)
      expect(writes).toEqual([])
      expect(pending).toEqual(['locked1'])
    }
  })

  it('does not duplicate an id that is both pending and freshly viewed', async () => {
    const { db, writes } = fakeDb({
      viewedIds: ['a'],
      scores: { a: '0.25' },
    })
    const pending = await rescoreConversionScores(db, ['a'])
    expect(writtenIds(writes)).toEqual(['a'])
    expect(pending).toEqual([])
  })

  it('writes the score postgres returned, without rounding it through a double', async () => {
    // conversion_score is an unconstrained numeric; the value below has more
    // precision than an IEEE-754 double can carry.
    const exact = '0.56320980858881971516496'
    const { db, writes } = fakeDb({ viewedIds: ['a'], scores: { a: exact } })

    await rescoreConversionScores(db)

    expect(writes[0].scores).toEqual([exact])
    expect(String(Number(exact))).not.toEqual(exact) // the rounding it avoids
  })

  it('retries a chunk whose score computation failed', async () => {
    const { db } = fakeDb({ viewedIds: ['a'], scores: { a: '0.25' } })
    const failing: ConversionScoreDb = {
      ...db,
      manyOrNone: async () => {
        throw new Error('statement timeout')
      },
    }
    expect(await rescoreConversionScores(failing)).toEqual(['a'])
  })
})
