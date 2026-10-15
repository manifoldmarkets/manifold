import { randomBytes } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { createServer, Server as HttpServer } from 'node:http'
import { AddressInfo, connect as connectTcp, Socket } from 'node:net'
import { WebSocket } from 'ws'
import { log } from 'shared/utils'
import { HANDOVER_KEY, readInstanceName, watchHandover } from './handover'

// Each writer below is a separate module instance, like a process on its own
// VM. They share these two mocks through globalThis.
jest.mock('shared/utils', () => {
  const shared = globalThis as unknown as { mockUtils?: object }
  shared.mockUtils ??= {
    LOCAL_DEV: false,
    log: Object.assign(jest.fn(), {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    metrics: { inc: jest.fn(), set: jest.fn() },
  }
  return shared.mockUtils
})
jest.mock('@redis/client', () => ({
  createClient: () =>
    (globalThis as unknown as { mockRedis: MockRedis }).mockRedis.connect(),
}))

// An in-memory Redis pub/sub bus. A client only receives while it is ready,
// so dropping a connection loses whatever is published meanwhile.
class MockRedisClient extends EventEmitter {
  isReady = false
  subscribed = false
  // Deliveries to this client to lose before it receives again.
  lose = 0
  published = 0
  private handler?: (message: string) => void
  constructor(private readonly bus: MockRedis) {
    super()
  }
  async connect() {
    // Like node-redis, keep retrying until the server is reachable.
    if (!this.bus.online) {
      await new Promise<void>((resolve) => this.bus.waiting.push(resolve))
    }
    this.isReady = true
    this.emit('ready')
  }
  async subscribe(_channel: string, handler: (message: string) => void) {
    this.handler = handler
    this.subscribed = true
  }
  async publish(_channel: string, message: string) {
    if (!this.isReady) throw new Error('The client is offline')
    this.published++
    for (const client of this.bus.clients) client.deliver(message)
  }
  deliver(message: string) {
    if (!this.subscribed || !this.isReady) return
    if (this.lose > 0) this.lose--
    else this.handler?.(message)
  }
  drop() {
    this.isReady = false
    this.emit('error', new Error('Socket closed unexpectedly'))
  }
  restore() {
    this.isReady = true
    this.emit('ready')
  }
  async quit() {
    this.isReady = false
    this.subscribed = false
  }
  async disconnect() {
    await this.quit()
  }
}
class MockRedis {
  online = true
  waiting: (() => void)[] = []
  clients: MockRedisClient[] = []
  goOnline() {
    this.online = true
    for (const connected of this.waiting.splice(0)) connected()
  }
  connect() {
    const client = new MockRedisClient(this)
    this.clients.push(client)
    return client
  }
}
let redis: MockRedis

const cleanup: (() => unknown)[] = []
beforeEach(() => {
  jest.clearAllMocks()
  redis = new MockRedis()
  ;(globalThis as unknown as { mockRedis: MockRedis }).mockRedis = redis
})
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
  delete process.env.GCE_METADATA_HOST
  jest.restoreAllMocks()
})

async function waitUntil(condition: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
const logged = (message: string) =>
  jest.mocked(log.info).mock.calls.some(([text]) => text === message)

async function listenLocally(server: HttpServer) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      })
  )
  return (server.address() as AddressInfo).port
}

// The GCE metadata server: the instance name, and the attribute directory
// with long polls that answer once the ETag differs from last_etag.
async function fakeMetadataServer() {
  let attributes: Record<string, string> = {}
  let etag = 1
  let failNext = 0
  const waiting = new Set<() => void>()
  const requests: URL[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://metadata')
    requests.push(url)
    if (req.headers['metadata-flavor'] !== 'Google') {
      res.writeHead(403).end()
      return
    }
    if (failNext > 0) {
      failNext--
      res.writeHead(503).end()
      return
    }
    if (url.pathname === '/computeMetadata/v1/instance/name') {
      res.writeHead(200).end('api-group-east-abcd')
      return
    }
    const respond = () =>
      res.writeHead(200, { ETag: String(etag) }).end(JSON.stringify(attributes))
    if (
      url.searchParams.get('wait_for_change') === 'true' &&
      url.searchParams.get('last_etag') === String(etag)
    ) {
      const done = () => {
        waiting.delete(done)
        clearTimeout(timer)
        respond()
      }
      const timer = setTimeout(
        done,
        Number(url.searchParams.get('timeout_sec')) * 1000
      )
      waiting.add(done)
      res.on('close', () => {
        waiting.delete(done)
        clearTimeout(timer)
      })
      return
    }
    respond()
  })
  const host = `127.0.0.1:${await listenLocally(server)}`
  return {
    host,
    requests,
    failNext: (count: number) => (failNext = count),
    // Like gcloud add-metadata: rewriting the same content changes nothing.
    set(next: Record<string, string>) {
      if (JSON.stringify(next) === JSON.stringify(attributes)) return
      attributes = next
      etag++
      for (const done of [...waiting]) done()
    },
    // Resolves once a watcher is parked on a long poll of the current content.
    async polling() {
      await waitUntil(() => waiting.size > 0)
    },
  }
}

type ServerModule = typeof import('./server')
async function startWriter(name: string, { sharedBroadcasts = true } = {}) {
  // listen() creates the subscriber, then the publisher.
  const [subscriberIndex, publisherIndex] = [0, 1].map(
    (i) => redis.clients.length + i
  )
  const env = process.env.REDIS_URL
  if (sharedBroadcasts) process.env.REDIS_URL = 'redis://memorystore:6379'
  else delete process.env.REDIS_URL
  let server!: ServerModule
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    server = require('./server')
  })
  process.env.REDIS_URL = env
  server.setWebSocketInstanceName(name)
  const http = createServer()
  const wss = server.listen(http, '/ws')
  const port = await listenLocally(http)
  if (sharedBroadcasts && redis.online) {
    await waitUntil(() => !!redis.clients[subscriberIndex]?.subscribed)
  }
  // Deleting the VM: a clean shutdown announces it first, a crash does not.
  const stop = async ({ announce = true } = {}) => {
    if (announce) await server.announceWebSocketShutdown()
    for (const socket of wss.clients) socket.terminate()
    await new Promise((resolve) => wss.close(resolve))
  }
  cleanup.push(() => wss.close())
  return {
    server,
    wss,
    url: `ws://127.0.0.1:${port}/ws`,
    stop,
    subscriber: () => redis.clients[subscriberIndex],
    publisher: () => redis.clients[publisherIndex],
  }
}
const closedBecause = (missed: string) =>
  expect(log.info).toHaveBeenCalledWith(
    'Writer handover: closed connections that may have missed broadcasts.',
    expect.objectContaining({ missed })
  )

type Message = { type: string; data?: { id?: string } }
async function subscriber(url: string) {
  const ws = new WebSocket(url)
  const messages: Message[] = []
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())))
  const closed = new Promise<number>((resolve) =>
    ws.on('close', (code) => resolve(code))
  )
  cleanup.push(() => ws.terminate())
  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'subscribe', txid: 1, topics: ['global/x'] }))
  await waitUntil(() => messages.some((m) => m.type === 'ack'))
  const events = () =>
    messages.filter((m) => m.type === 'broadcast').map((m) => m.data?.id)
  return { ws, closed, events }
}

// Completes the upgrade, then never answers a close frame, like a peer on a
// slow network: the server's socket stays in wss.clients while it closes.
async function silentPeer(url: string) {
  const socket: Socket = connectTcp(Number(new URL(url).port), '127.0.0.1')
  cleanup.push(() => socket.destroy())
  await once(socket, 'connect')
  socket.write(
    [
      'GET /ws HTTP/1.1',
      'Host: 127.0.0.1',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`,
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n')
  )
  const [response] = await once(socket, 'data')
  expect(String(response)).toMatch(/^HTTP\/1\.1 101/)
}

// Two writers overlapping during a deploy, each with one subscribed client,
// and the survivor watching for the deploy's handover signal.
async function overlap({ oldShares = true, newShares = true } = {}) {
  const metadata = await fakeMetadataServer()
  process.env.GCE_METADATA_HOST = metadata.host
  const oldWriter = await startWriter('old-vm', { sharedBroadcasts: oldShares })
  const newWriter = await startWriter('new-vm', { sharedBroadcasts: newShares })
  newWriter.server.watchWebSocketHandover(newWriter.wss)
  await metadata.polling()
  const onOld = await subscriber(oldWriter.url)
  const onNew = await subscriber(newWriter.url)
  // The deploy deletes the old VM, then names it to the survivor.
  const handOver = async ({ announce = true } = {}) => {
    await oldWriter.stop({ announce })
    expect(await onOld.closed).toBe(1006)
    metadata.set({ [HANDOVER_KEY]: 'old-vm' })
  }
  return { oldWriter, newWriter, onOld, onNew, handOver }
}

describe('handover watcher', () => {
  it('treats the startup value as a baseline and reports each new value once', async () => {
    const metadata = await fakeMetadataServer()
    metadata.set({ [HANDOVER_KEY]: 'earlier', 'ssh-keys': 'a' })
    const seen: string[] = []
    cleanup.push(watchHandover((value) => seen.push(value), metadata))
    await metadata.polling()
    metadata.set({ [HANDOVER_KEY]: 'earlier', 'ssh-keys': 'b' })
    await metadata.polling()
    metadata.set({ [HANDOVER_KEY]: 'retired-1', 'ssh-keys': 'b' })
    await waitUntil(() => seen.length === 1)
    await metadata.polling()
    metadata.set({ [HANDOVER_KEY]: 'retired-2', 'ssh-keys': 'b' })
    await waitUntil(() => seen.length === 2)
    await metadata.polling()
    expect(seen).toEqual(['retired-1', 'retired-2'])
    // Every read after the first is a long poll pinned to the last ETag.
    for (const url of metadata.requests.slice(1)) {
      expect(url.searchParams.get('wait_for_change')).toBe('true')
      expect(url.searchParams.get('last_etag')).toBeTruthy()
    }
  })

  it('keeps retrying while the metadata server fails', async () => {
    const metadata = await fakeMetadataServer()
    metadata.failNext(3)
    const seen: string[] = []
    cleanup.push(
      watchHandover((value) => seen.push(value), {
        host: metadata.host,
        retryDelayMs: 1,
      })
    )
    await metadata.polling()
    expect(log.warn).toHaveBeenCalledTimes(1)
    metadata.set({ [HANDOVER_KEY]: 'retired' })
    await waitUntil(() => seen.length === 1)
    expect(seen).toEqual(['retired'])
  })

  it('does not repeat a handover whose callback throws', async () => {
    const metadata = await fakeMetadataServer()
    const callback = jest.fn(() => {
      throw new Error('boom')
    })
    cleanup.push(watchHandover(callback, metadata))
    await metadata.polling()
    metadata.set({ [HANDOVER_KEY]: 'retired' })
    await waitUntil(() => callback.mock.calls.length === 1)
    metadata.set({ [HANDOVER_KEY]: 'retired', 'ssh-keys': 'a' })
    await metadata.polling()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      'WebSocket handover failed.',
      expect.objectContaining({ handover: 'retired' })
    )
  })

  it('reads the instance name the deploy helper refers to', async () => {
    const metadata = await fakeMetadataServer()
    expect(await readInstanceName(metadata)).toBe('api-group-east-abcd')
  })

  it('uses the key the deploy helper writes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const helper = require('../../../api/deploy-rollout.cjs')
    expect(helper.HANDOVER_KEY).toBe(HANDOVER_KEY)
  })
})

describe('websocket server', () => {
  it('sweeps dead connections without tripping over sockets that are still closing', async () => {
    const intervals = jest.spyOn(global, 'setInterval')
    const writer = await startWriter('vm', { sharedBroadcasts: false })
    const sweep = intervals.mock.calls.find(
      ([, ms]) => ms === 60_000
    )?.[0] as () => void
    expect(sweep).toBeDefined()

    await silentPeer(writer.url)
    await waitUntil(() => writer.wss.clients.size === 1)
    const [closing] = writer.wss.clients
    writer.server.closeAllConnections(1012, 'test')
    expect(closing.readyState).toBe(WebSocket.CLOSING)
    // ws keeps tracking the socket until the handshake completes or times out.
    expect(writer.wss.clients.has(closing)).toBe(true)
    // A socket the switchboard never registered, as a rejected upgrade leaves.
    const unregistered = {
      readyState: WebSocket.CLOSING,
      terminate: jest.fn(),
    } as unknown as WebSocket
    writer.wss.clients.add(unregistered)
    expect(sweep).not.toThrow()

    // Once stale, the closing socket is terminated instead of waiting it out.
    const later = Date.now() + 120_000
    jest.spyOn(Date, 'now').mockReturnValue(later)
    expect(sweep).not.toThrow()
    jest.mocked(Date.now).mockRestore()
    await waitUntil(() => !writer.wss.clients.has(closing))
    expect(unregistered.terminate).not.toHaveBeenCalled()
    writer.wss.clients.delete(unregistered)
  })

  it('relays broadcasts between overlapping writers exactly once', async () => {
    const { oldWriter, newWriter, onOld, onNew } = await overlap()
    oldWriter.server.broadcast('global/x', { id: 'from-old' })
    newWriter.server.broadcast('global/x', { id: 'from-new' })
    await waitUntil(
      () => onOld.events().length === 2 && onNew.events().length === 2
    )
    expect(onOld.events()).toEqual(['from-old', 'from-new'])
    expect(onNew.events()).toEqual(['from-old', 'from-new'])
  })

  it('keeps connections through a handover once every old broadcast arrived', async () => {
    const { oldWriter, newWriter, onNew, handOver } = await overlap()
    oldWriter.server.broadcast('global/x', { id: 'from-old' })
    await waitUntil(() => onNew.events().length === 1)
    await handOver()
    await waitUntil(() =>
      logged('Writer handover: every broadcast from the old writer arrived.')
    )
    newWriter.server.broadcast('global/x', { id: 'after' })
    await waitUntil(() => onNew.events().includes('after'))
    expect(onNew.ws.readyState).toBe(WebSocket.OPEN)
  })

  it('closes connections after a handover if an old broadcast was lost', async () => {
    const { oldWriter, newWriter, onNew, handOver } = await overlap()
    oldWriter.server.broadcast('global/x', { id: 'before' })
    await waitUntil(() => onNew.events().length === 1)
    newWriter.subscriber().lose = 1
    oldWriter.server.broadcast('global/x', { id: 'lost' })
    oldWriter.server.broadcast('global/x', { id: 'after' })
    await waitUntil(() => onNew.events().length === 2)
    expect(onNew.events()).toEqual(['before', 'after'])
    await handOver()
    expect(await onNew.closed).toBe(1012)
    closedBecause('missed broadcasts from old-vm')
  })

  it('closes connections after a handover if the old writer did not announce its shutdown', async () => {
    const { oldWriter, onNew, handOver } = await overlap()
    oldWriter.server.broadcast('global/x', { id: 'from-old' })
    await waitUntil(() => onNew.events().length === 1)
    await handOver({ announce: false })
    expect(await onNew.closed).toBe(1012)
    closedBecause('old-vm did not announce its shutdown')
  })

  it('closes connections after a handover from a writer without shared broadcasts', async () => {
    // The first production transition: the running writer predates this.
    const { oldWriter, newWriter, onOld, onNew, handOver } = await overlap({
      oldShares: false,
    })
    oldWriter.server.broadcast('global/x', { id: 'from-old' })
    newWriter.server.broadcast('global/x', { id: 'from-new' })
    await waitUntil(
      () => onOld.events().length === 1 && onNew.events().length === 1
    )
    expect(onOld.events()).toEqual(['from-old'])
    expect(onNew.events()).toEqual(['from-new'])
    await handOver()
    expect(await onNew.closed).toBe(1012)
    closedBecause('never heard from old-vm')
    const after = await subscriber(newWriter.url)
    newWriter.server.broadcast('global/x', { id: 'after' })
    await waitUntil(() => after.events().includes('after'))
  })

  it('closes connections after any handover when this writer shares nothing', async () => {
    // Dev deploys without Redis.
    const { onNew, handOver } = await overlap({
      oldShares: false,
      newShares: false,
    })
    await handOver()
    expect(await onNew.closed).toBe(1012)
    closedBecause('shared broadcasts are disabled here')
  })

  it('closes connections when the writer it outlived started during a subscription outage', async () => {
    // A rollback: the long-running writer survives, and its subscription was
    // down while the replacement started broadcasting.
    const metadata = await fakeMetadataServer()
    process.env.GCE_METADATA_HOST = metadata.host
    const survivor = await startWriter('old-vm')
    survivor.server.watchWebSocketHandover(survivor.wss)
    await metadata.polling()
    const client = await subscriber(survivor.url)
    survivor.subscriber().drop()
    const replacement = await startWriter('new-vm')
    replacement.server.broadcast('global/x', { id: 'missed' })
    survivor.subscriber().restore()
    replacement.server.broadcast('global/x', { id: 'received' })
    await waitUntil(() => client.events().length === 1)
    await replacement.stop()
    metadata.set({ [HANDOVER_KEY]: 'new-vm' })
    expect(await client.closed).toBe(1012)
    closedBecause('missed broadcasts from new-vm')
  })

  it('never waits for or queues a broadcast while Redis is unreachable', async () => {
    redis.online = false
    const writer = await startWriter('vm')
    const client = await subscriber(writer.url)
    writer.server.broadcast('global/x', { id: 'local' })
    await waitUntil(() => client.events().includes('local'))
    // Dropped, not held until Redis returns.
    redis.goOnline()
    await waitUntil(() => writer.publisher().isReady)
    expect(writer.publisher().published).toBe(0)
    writer.server.broadcast('global/x', { id: 'shared' })
    expect(writer.publisher().published).toBe(1)
  })

  it('keeps local delivery and connections through a Redis outage', async () => {
    const writer = await startWriter('vm')
    const client = await subscriber(writer.url)
    const published = writer.publisher().published
    writer.subscriber().drop()
    writer.publisher().drop()
    writer.server.broadcast('global/x', { id: 'during-outage' })
    await waitUntil(() => client.events().includes('during-outage'))
    expect(writer.publisher().published).toBe(published)
    writer.subscriber().restore()
    writer.publisher().restore()
    writer.server.broadcast('global/x', { id: 'after-outage' })
    await waitUntil(() => client.events().includes('after-outage'))
    expect(client.ws.readyState).toBe(WebSocket.OPEN)
  })

  it('closes every connection from before a handover with 1012 and keeps later ones', async () => {
    const metadata = await fakeMetadataServer()
    process.env.GCE_METADATA_HOST = metadata.host
    metadata.set({ [HANDOVER_KEY]: 'earlier' })
    const writer = await startWriter('vm', { sharedBroadcasts: false })
    writer.server.watchWebSocketHandover(writer.wss)
    await metadata.polling()
    const before = await Promise.all([
      subscriber(writer.url),
      subscriber(writer.url),
    ])
    metadata.set({ [HANDOVER_KEY]: 'retired' })
    for (const client of before) expect(await client.closed).toBe(1012)
    const after = await subscriber(writer.url)
    writer.server.broadcast('global/x', { id: 'next' })
    await waitUntil(() => after.events().includes('next'))
    expect(after.ws.readyState).toBe(WebSocket.OPEN)
  })
})
