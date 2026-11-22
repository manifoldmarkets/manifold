import { createHash } from 'node:crypto'

import {
  BdlAttempt,
  BdlClock,
  BdlHttpError,
  BdlParams,
  bdlRecordingPathParts,
  createBdlClient,
} from 'shared/balldontlie-client'
import type { History, PlanStep } from './plan'
import { maxPaidRecorderRate } from './rate'
import { isRow } from './spec'
import { createRecordingStore } from './store'

export const defaultRecorderRate = 3
export { maxPaidRecorderRate } from './rate'
const maxCursorPages = 10000

export type RecorderOptions = {
  out: string
  key: string
  rate?: number
  resume?: boolean
  clock?: BdlClock
  transport?: (url: string, init: RequestInit) => Promise<Response>
  acquireSharedSlot?: (rate: number) => Promise<void>
}

export const emptySummary = () => ({
  dispatched: 0,
  httpResponses: 0,
  usableSnapshots: 0,
  cacheRefreshFailures: 0,
  get calls() {
    return this.dispatched
  },
  get successful() {
    return this.usableSnapshots
  },
  resumed: 0,
  unauthorized: 0,
  rateLimited: 0,
  serverErrors: 0,
  skippedUnentitled: 0,
  rejectedProbes: [] as { label: string; status: number }[],
})

// The plan consumes provider pages with either a data list or a detail object.
// Preserve other safely decoded replies as evidence, without claiming coverage.
const usable = (attempt: BdlAttempt) =>
  attempt.status >= 200 &&
  attempt.status < 300 &&
  isRow(attempt.body) &&
  (Array.isArray(attempt.body.data) || isRow(attempt.body.data))

function cursorOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('meta' in body)) return
  const meta = body.meta
  if (!meta || typeof meta !== 'object' || !('next_cursor' in meta)) return
  const cursor = meta.next_cursor
  if (cursor === null || cursor === undefined || cursor === '') return
  if (
    typeof cursor !== 'string' &&
    !(typeof cursor === 'number' && Number.isSafeInteger(cursor))
  )
    throw new Error('Invalid pagination cursor.')
  return String(cursor)
}

function safeToPersist(value: unknown, key: string) {
  if (key && JSON.stringify(value).includes(JSON.stringify(key).slice(1, -1)))
    throw new Error(
      'Provider echoed the credential. Recording stopped before writing the response.'
    )
}

export function createRecorder(options: RecorderOptions) {
  const { key } = options
  if (!/^[!-~]+$/.test(key)) throw new Error('Invalid key file contents.')
  const rate = options.rate ?? defaultRecorderRate
  if (!Number.isFinite(rate) || rate <= 0 || rate > maxPaidRecorderRate)
    throw new Error('Invalid recorder rate.')
  if (process.env.BDL_FIXTURE_DIR || process.env.SPORTS_FAKE_NOW)
    throw new Error('Clear fixture and fake clock settings before recording.')
  safeToPersist(options.out, key)
  const store = createRecordingStore(options.out)
  const summary = emptySummary()
  const now = options.clock?.now ?? Date.now
  const denied = new Set<string>()
  let consecutiveServerErrors = 0
  const client = createBdlClient({
    key,
    async transport(url, init) {
      summary.dispatched++
      const response = await (options.transport ?? fetch)(url, init)
      summary.httpResponses++
      if (response.status === 401) summary.unauthorized++
      if (response.status === 429) summary.rateLimited++
      if (response.status >= 500 && response.status <= 599) {
        summary.serverErrors++
        consecutiveServerErrors++
      } else consecutiveServerErrors = 0
      return response
    },
    clock: options.clock,
    role: 'recorder',
    recorderRate: rate,
    acquireSharedSlot: options.acquireSharedSlot,
    maxAttempts: 6,
    onAttempt(attempt) {
      safeToPersist(attempt, key)
      const { cacheRefreshed } = store.save(attempt)
      if (usable(attempt)) summary.usableSnapshots++
      if (!cacheRefreshed) {
        summary.cacheRefreshFailures++
        throw new Error(
          'Snapshot saved, but the recording cache could not be refreshed.'
        )
      }
      if (consecutiveServerErrors >= 3)
        throw new Error(
          'Three consecutive server errors. Use --resume after the provider recovers.'
        )
    },
  })

  async function page(
    endpoint: string,
    params: BdlParams,
    resume: boolean,
    step: PlanStep
  ) {
    // Some list/detail plans request several IDs on the same protected route.
    const route = endpoint.replace(/\/\d+(?=\/|$)/g, '/:id')
    if (denied.has(route)) {
      summary.skippedUnentitled++
      return
    }
    if (resume) {
      const saved = store.read(endpoint, params)
      if (saved && usable(saved)) {
        summary.resumed++
        return saved
      }
    }
    try {
      return await client.get(endpoint, params)
    } catch (error) {
      if (!(error instanceof BdlHttpError)) throw error
      if (step.rejectedStatuses?.includes(error.status)) {
        summary.rejectedProbes.push({ label: step.label, status: error.status })
        return undefined
      }
      if (error.status !== 401) throw error
      denied.add(route)
      return undefined
    }
  }

  async function run(steps: PlanStep[], watching = false) {
    const observations: Record<string, unknown[]> = {}
    const observedAt: Record<string, string[]> = {}
    let complete = true
    const history: History = new Map()
    const lastUse = new Map<string, number>()
    steps.forEach((step, index) => {
      for (const source of step.dependsOn ?? []) lastUse.set(source, index)
    })
    for (const [index, step] of steps.entries()) {
      const keepHistory = lastUse.has(step.label)
      const bodies: unknown[] = []
      for (const request of step.resolve(history)) {
        const seen = new Set<string>()
        let params: BdlParams = request.params
        for (;;) {
          const identity = bdlRecordingPathParts(
            request.path,
            params
          ).parameterHash
          if (seen.has(identity) || seen.size >= maxCursorPages)
            throw new Error(
              'Pagination repeated or exceeded the page cap at ' + request.path
            )
          seen.add(identity)
          const result: BdlAttempt | undefined = await page(
            request.path,
            params,
            !!options.resume && !watching,
            step
          )
          if (!result) break
          if (!usable(result)) {
            complete = false
            break
          }
          if (keepHistory) bodies.push(result.body)
          if (watching) {
            const selected = step.select
              ? step.select(result.body)
              : result.body
            if (
              selected != null &&
              !(Array.isArray(selected) && selected.length === 0)
            ) {
              const pages = (observations[step.label] ??= [])
              pages.push(selected)
              const timestamps = (observedAt[step.label] ??= [])
              timestamps.push(new Date(now()).toISOString())
            }
          }
          const next = step.paginate ? cursorOf(result.body) : undefined
          if (next === undefined) break
          params = { ...request.params, cursor: next }
        }
      }
      if (keepHistory) history.set(step.label, bodies)
      for (const source of step.dependsOn ?? []) {
        if (lastUse.get(source) === index) history.delete(source)
      }
    }
    return { observations, observedAt, complete }
  }

  async function watch(
    league: string,
    id: string,
    makeSteps: (now: Date) => PlanStep[],
    signal: AbortSignal
  ) {
    let digest = store.lastWatchDigest(league, id)
    while (!signal.aborted) {
      const started = now()
      const before = summary.unauthorized
      const { observations, observedAt, complete } = await run(
        makeSteps(new Date(started)),
        true
      )
      if (summary.unauthorized > before)
        throw new Error('Watch endpoint is unentitled.')
      const nextDigest = createHash('sha256')
        .update(JSON.stringify(observations))
        .digest('hex')
      if (complete && digest !== nextDigest) {
        const change = {
          at: new Date(now()).toISOString(),
          digest: nextDigest,
          observations,
          observedAt,
        }
        safeToPersist(change, key)
        store.watch(league, id, change)
        digest = nextDigest
      }
      if (!signal.aborted) {
        const wait = Math.max(0, 60000 - (now() - started))
        if (options.clock) await options.clock.sleep(wait)
        else
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer)
              signal.removeEventListener('abort', finish)
              resolve()
            }
            const timer = setTimeout(finish, wait)
            signal.addEventListener('abort', finish, { once: true })
          })
      }
    }
  }
  return { run, watch, summary }
}
