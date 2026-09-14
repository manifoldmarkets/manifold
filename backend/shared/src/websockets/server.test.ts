import { EventEmitter } from 'node:events'

// Only the socket transports are mocked. Each isolated module below runs the
// real switchboard, subscription parser, broadcast fanout and origin dedup.
jest.mock('@redis/client', () => ({ createClient: jest.fn() }))
jest.mock('shared/utils', () => ({
  LOCAL_DEV: false,
  log: Object.assign(jest.fn(), {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  metrics: { inc: jest.fn(), set: jest.fn() },
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () => ({
    $pool: { idleCount: 1, waitingCount: 0 },
  }),
}))
jest.mock('ws', () => {
  const { EventEmitter } = jest.requireActual('node:events')
  return {
    Server: class extends EventEmitter {
      clients = new Set()
    },
  }
})

type Listener = (message: string) => void
let channels: Map<string, Set<Listener>>
let clients: FakeRedis[]
let pendingSubscribe: Promise<void> | undefined

class FakeRedis extends EventEmitter {
  isReady = false
  subscriptions = new Map<string, Listener>()
  connect = jest.fn(async () => {
    this.isReady = true
    return this
  })
  subscribe = jest.fn(async (channel: string, listener: Listener) => {
    await pendingSubscribe
    const listeners = channels.get(channel) ?? new Set<Listener>()
    listeners.add(listener)
    channels.set(channel, listeners)
    this.subscriptions.set(channel, listener)
  })
  publish = jest.fn(async (channel: string, message: string) => {
    if (!this.isReady) throw new Error('Redis offline')
    for (const listener of channels.get(channel) ?? []) listener(message)
    return channels.get(channel)?.size ?? 0
  })
  quit = jest.fn(async () => {
    this.isReady = false
    for (const [channel, listener] of this.subscriptions) {
      channels.get(channel)?.delete(listener)
    }
  })
}

class FakeSocket extends EventEmitter {
  messages: { type: string; data?: { id?: string } }[] = []
  send(message: string, callback?: () => void) {
    this.messages.push(JSON.parse(message))
    callback?.()
  }
  terminate = jest.fn(() => this.emit('close', 1006, Buffer.from('')))
  close = jest.fn((code: number) => this.emit('close', code, Buffer.from('')))
}

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
type Server = typeof import('./server')
type Health = {
  markCachesLoaded: () => void
  healthzReady: (req: object, res: object) => void
}
function writer() {
  let server!: Server
  let health!: Health
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    server = require('./server')
    // Exercise the actual HTTP readiness gate as well as the shared transport.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    health = require('../../../api/src/healthz')
  })
  const offset = clients.length
  const wss = server.listen({} as never, '/ws')
  return {
    server,
    health,
    wss,
    subscriber: clients[offset],
    publisher: clients[offset + 1],
    connect() {
      const socket = new FakeSocket()
      wss.emit('connection', socket)
      if (!socket.close.mock.calls.length) {
        socket.emit(
          'message',
          Buffer.from(
            JSON.stringify({
              type: 'subscribe',
              txid: 1,
              topics: ['global/new-bet'],
            })
          )
        )
      }
      return socket
    },
  }
}
function readiness(health: Health) {
  const result = { code: 0, body: {} }
  health.healthzReady(
    {},
    {
      status(code: number) {
        result.code = code
        return this
      },
      json(body: object) {
        result.body = body
      },
    }
  )
  return result
}
const broadcasts = (socket: FakeSocket) =>
  socket.messages
    .filter((message) => message.type === 'broadcast')
    .map((message) => message.data?.id)

const originalEnv = process.env
beforeEach(() => {
  process.env = {
    ...originalEnv,
    REDIS_URL: 'redis://shared:6379',
    REQUIRE_REDIS_BROADCASTS: 'true',
    DISABLE_REDIS_CACHE: 'true',
    NEXT_PUBLIC_FIREBASE_ENV: 'PROD',
  }
  delete process.env.READ_ONLY
  channels = new Map()
  clients = []
  pendingSubscribe = undefined
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@redis/client').createClient.mockImplementation(() => {
    const client = new FakeRedis()
    clients.push(client)
    return client
  })
})
afterEach(() => {
  process.env = originalEnv
})

test("both writers deliver each other's events exactly once during overlap with L2 caching disabled", async () => {
  const old = writer(),
    replacement = writer()
  await flush()
  const a = old.connect(),
    b = replacement.connect()
  old.server.broadcastMulti(['global/new-bet'], { id: 'old-writer-event' })
  await flush()
  replacement.server.broadcastMulti(['global/new-bet'], {
    id: 'new-writer-event',
  })
  await flush()
  expect(broadcasts(a)).toEqual(['old-writer-event', 'new-writer-event'])
  expect(broadcasts(b)).toEqual(['old-writer-event', 'new-writer-event'])
})

test('warm caches do not make the writer ready before its SUBSCRIBE acknowledgement', async () => {
  let acknowledge!: () => void
  pendingSubscribe = new Promise<void>((resolve) => {
    acknowledge = resolve
  })
  const w = writer()
  w.health.markCachesLoaded()
  await flush()
  expect(w.publisher.isReady).toBe(true)
  expect(w.subscriber.isReady).toBe(true)
  expect(readiness(w.health)).toEqual({
    code: 503,
    body: { status: 'broadcast-unavailable' },
  })
  const socket = w.connect()
  expect(socket.close).toHaveBeenCalledWith(1013, expect.any(String))
  expect(() =>
    socket.emit('error', new Error('closed during rejection'))
  ).not.toThrow()
  acknowledge()
  await flush()
  expect(readiness(w.health).code).toBe(200)
})

test('readiness requires a connected publisher as well as a subscriber', async () => {
  const w = writer()
  await flush()
  w.health.markCachesLoaded()
  w.publisher.isReady = false
  expect(readiness(w.health).code).toBe(503)
  w.publisher.isReady = true
  expect(readiness(w.health).code).toBe(200)
})

test('losing a shared subscription withdraws readiness and disconnects existing clients', async () => {
  const w = writer()
  await flush()
  w.health.markCachesLoaded()
  const socket = w.connect()
  w.subscriber.isReady = false
  w.subscriber.emit('reconnecting')
  expect(socket.terminate).toHaveBeenCalledTimes(1)
  expect(readiness(w.health).code).toBe(503)
  expect(w.connect().close).toHaveBeenCalledWith(1013, expect.any(String))
  // node-redis restores subscriptions before reporting isReady on reconnect.
  w.subscriber.isReady = true
  w.subscriber.emit('ready')
  expect(readiness(w.health).code).toBe(200)
  const reconnected = w.connect()
  w.server.broadcast('global/new-bet', { id: 'after-reconnect' })
  await flush()
  expect(broadcasts(reconnected)).toEqual(['after-reconnect'])
})

test('a publisher disconnection also closes existing feed sockets', async () => {
  const w = writer()
  await flush()
  const socket = w.connect()
  w.publisher.isReady = false
  w.publisher.emit('error', new Error('connection lost'))
  expect(socket.terminate).toHaveBeenCalledTimes(1)
  expect(w.server.isWebSocketBroadcastReady()).toBe(false)
})

test('a required but missing Redis URL cannot pass readiness', async () => {
  delete process.env.REDIS_URL
  const w = writer()
  w.health.markCachesLoaded()
  expect(readiness(w.health).code).toBe(503)
  expect(w.connect().close).toHaveBeenCalledWith(1013, expect.any(String))
})

test('read processes do not require a WebSocket publisher/subscriber', () => {
  process.env.READ_ONLY = 'true'
  const w = writer()
  w.health.markCachesLoaded()
  expect(w.server.isWebSocketBroadcastReady()).toBe(false)
  expect(readiness(w.health).code).toBe(200)
})

test('single-writer local development can still broadcast without Redis', async () => {
  delete process.env.REDIS_URL
  process.env.REQUIRE_REDIS_BROADCASTS = 'false'
  const w = writer()
  w.health.markCachesLoaded()
  const socket = w.connect()
  w.server.broadcast('global/new-bet', { id: 'local' })
  await flush()
  expect(readiness(w.health).code).toBe(200)
  expect(broadcasts(socket)).toEqual(['local'])
})
