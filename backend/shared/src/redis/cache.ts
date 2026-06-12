import { createClient } from 'redis/dist/index'
import { log, metrics } from 'shared/utils'

// A small, shared Redis-backed cache for data that is expensive to compute from
// postgres and is otherwise held per-process in memory. The point is to share
// it across the pm2 processes on a box and, crucially, to survive redeploys:
// a freshly started process can read a warm value from Redis instead of
// re-querying the db (which, multiplied across processes on every deploy, is a
// meaningful db load spike).
//
// Every operation degrades gracefully: if Redis is unconfigured, disabled,
// down, or slow-to-error, the helpers return "miss" and the caller falls back
// to its existing db path.
//
// Redis must never be able to break a request!

type RedisClient = ReturnType<typeof createClient>

// Namespaced by project so dev and prod can't collide if they ever share an
// instance, and so a key scheme change is a prefix bump rather than a flush.
const KEY_PREFIX = `cache:v1:${process.env.GOOGLE_CLOUD_PROJECT ?? 'local'}:`

const RECONNECT_MAX_DELAY_MS = 30_000
// Bound the initial connect so request paths fall back instead of waiting on
// node-redis' reconnect loop while Redis is down.
const INITIAL_CONNECT_TIMEOUT_MS = 1_000
// After a failed initial connect, don't try again for this long — otherwise a
// request storm while Redis is down would create a client per call.
const CONNECT_COOLDOWN_MS = 10_000

let client: RedisClient | undefined
let connectPromise: Promise<RedisClient | undefined> | undefined
let cooldownUntil = 0

function getCacheRedisUrl() {
  const url = process.env.REDIS_URL
  return url && url.trim().length > 0 ? url : undefined
}

function cacheEnabled() {
  return (
    process.env.DISABLE_REDIS_CACHE !== 'true' && getCacheRedisUrl() != null
  )
}

function errDetails(err: unknown) {
  const e = (err ?? {}) as { name?: unknown; message?: unknown; code?: unknown }
  return { name: e.name, message: e.message, code: e.code }
}

async function connectWithTimeout(c: RedisClient) {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      c.connect(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Redis cache initial connect timed out.')),
          INITIAL_CONNECT_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

// Returns a *ready* client, or undefined if Redis is unavailable. Never throws.
// Only ever creates one client: while it's reconnecting (isReady === false) we
// return undefined so callers fall back rather than spawning a second client.
async function getClient(): Promise<RedisClient | undefined> {
  if (!cacheEnabled()) return undefined
  if (client) return client.isReady ? client : undefined
  if (connectPromise) return connectPromise
  if (Date.now() < cooldownUntil) return undefined

  const url = getCacheRedisUrl()!
  const c = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) =>
        Math.min(1000 * 2 ** retries, RECONNECT_MAX_DELAY_MS),
    },
  })
  // An 'error' listener is required, else the client throws on connection drops.
  c.on('error', (err: unknown) => {
    metrics.inc('cache/redis_errors')
    log.error('Redis cache client error.', errDetails(err))
  })

  connectPromise = connectWithTimeout(c)
    .then(() => {
      client = c
      log.info('Redis cache client connected.')
      return c
    })
    .catch((err: unknown) => {
      cooldownUntil = Date.now() + CONNECT_COOLDOWN_MS
      log.error(
        'Redis cache client failed to connect; falling back to db.',
        errDetails(err)
      )
      // Tear down the dead client so the next attempt (after the cooldown)
      // starts a fresh one rather than leaking sockets/listeners.
      void c.disconnect().catch(() => {})
      return undefined
    })
    .finally(() => {
      connectPromise = undefined
    })

  return connectPromise
}

export async function cacheGetJson<T>(key: string): Promise<T | undefined> {
  const c = await getClient()
  if (!c) return undefined
  try {
    const raw = await c.get(KEY_PREFIX + key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch (err) {
    metrics.inc('cache/redis_errors')
    log.error('Redis cache get failed.', { key, ...errDetails(err) })
    return undefined
  }
}

// Batch get. Returns results positionally aligned with `keys`; misses (and any
// Redis failure) come back as undefined for that slot.
export async function cacheMGetJson<T>(
  keys: string[]
): Promise<(T | undefined)[]> {
  if (keys.length === 0) return []
  const c = await getClient()
  if (!c) return keys.map(() => undefined)
  try {
    const raws = await c.mGet(keys.map((k) => KEY_PREFIX + k))
    return raws.map((raw) => {
      if (raw == null) return undefined
      try {
        return JSON.parse(raw) as T
      } catch {
        return undefined
      }
    })
  } catch (err) {
    metrics.inc('cache/redis_errors')
    log.error('Redis cache mget failed.', {
      count: keys.length,
      ...errDetails(err),
    })
    return keys.map(() => undefined)
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const c = await getClient()
  if (!c) return
  try {
    await c.set(KEY_PREFIX + key, JSON.stringify(value), { EX: ttlSeconds })
  } catch (err) {
    metrics.inc('cache/redis_errors')
    log.error('Redis cache set failed.', { key, ...errDetails(err) })
  }
}

// Batch set, each entry with the same TTL. Best-effort and non-throwing.
export async function cacheSetManyJson(
  entries: { key: string; value: unknown }[],
  ttlSeconds: number
): Promise<void> {
  if (entries.length === 0) return
  const c = await getClient()
  if (!c) return
  try {
    const multi = c.multi()
    for (const { key, value } of entries) {
      multi.set(KEY_PREFIX + key, JSON.stringify(value), { EX: ttlSeconds })
    }
    await multi.exec()
  } catch (err) {
    metrics.inc('cache/redis_errors')
    log.error('Redis cache mset failed.', {
      count: entries.length,
      ...errDetails(err),
    })
  }
}
