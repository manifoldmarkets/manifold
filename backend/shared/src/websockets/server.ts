import { randomUUID } from 'node:crypto'
import { Server as HttpServer } from 'node:http'
import { hostname } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { createClient } from '@redis/client'
import { Server as WebSocketServer, RawData, WebSocket } from 'ws'
import { isError } from 'lodash'
import { LOCAL_DEV, log, metrics } from 'shared/utils'
import { Switchboard } from './switchboard'
import { watchHandover } from './handover'
import {
  BroadcastPayload,
  ClientMessage,
  ServerMessage,
  CLIENT_MESSAGE_SCHEMA,
} from 'common/api/websockets'

const SWITCHBOARD = new Switchboard()

// if a connection doesn't ping for this long, we assume the other side is toast
const CONNECTION_TIMEOUT_MS = 60 * 1000
// 1012 (Service Restart) tells clients to reconnect, resubscribe and backfill.
const HANDOVER_CLOSE_CODE = 1012
const DEFAULT_REDIS_BROADCAST_CHANNEL_PREFIX = 'api-websocket-broadcasts'
const REDIS_SUBSCRIBER_INITIAL_RETRY_DELAY_MS = 1_000
const REDIS_SUBSCRIBER_MAX_RETRY_DELAY_MS = 60_000
// How often an idle writer tells the others its event count.
const REDIS_HEARTBEAT_MS = 5_000
const REDIS_SHUTDOWN_TIMEOUT_MS = 500
const REDIS_LOG_INTERVAL_MS = 60_000
const WEBSOCKET_INSTANCE_ID = randomUUID()
const REDIS_URL = process.env.REDIS_URL?.trim() || undefined

// What writers exchange on the shared channel. Every message carries the
// sender's count of broadcasts so far, so a receiver can tell whether it got
// all of them (see trackSender and watchWebSocketHandover).
type RedisBroadcast = {
  originInstanceId?: string
  // The sender's VM instance name, which a deploy's handover refers to.
  host?: string
  kind?: 'event' | 'heartbeat' | 'shutdown'
  eventSeq?: number
  topics?: string[]
  data?: BroadcastPayload
}

type RedisClient = ReturnType<typeof createClient>

let redisPublisher: RedisClient | undefined
let redisSubscriber: RedisClient | undefined
let redisSubscriberConnect: Promise<void> | undefined
let redisSubscriberShouldRun = false
let redisSubscriberRetryTimeout: NodeJS.Timeout | undefined
let redisSubscriberRetryDelayMs = REDIS_SUBSCRIBER_INITIAL_RETRY_DELAY_MS
let localHost = hostname()
let eventSeq = 0

type SenderState = {
  host: string
  lastEventSeq: number
  // False once one of the sender's broadcasts may not have reached this writer.
  complete: boolean
  shutDown: boolean
}
const senders = new Map<string, SenderState>()

// Categorize topics to avoid unbounded metric cardinality
function getTopicCategory(topic: string): string {
  if (topic.startsWith('answer/')) {
    return 'answer'
  } else if (topic.startsWith('contract/')) {
    return 'contract'
  } else if (topic.startsWith('user/')) {
    return 'user'
  } else if (topic.startsWith('private-user/')) {
    return 'private-user'
  } else if (topic === 'global' || topic.startsWith('global/')) {
    return 'global'
  } else if (topic.startsWith('post/')) {
    return 'post'
  } else {
    return 'other'
  }
}

export class MessageParseError extends Error {
  details?: unknown
  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'MessageParseError'
    this.details = details
  }
}

function serializeError(err: unknown) {
  return isError(err) ? err.message : 'Unexpected error.'
}

function parseMessage(data: RawData): ClientMessage {
  let messageObj: any
  try {
    messageObj = JSON.parse(data.toString())
  } catch (err) {
    log.error(err)
    throw new MessageParseError('Message was not valid UTF-8 encoded JSON.')
  }
  const result = CLIENT_MESSAGE_SCHEMA.safeParse(messageObj)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    throw new MessageParseError('Error parsing message.', issues)
  } else {
    return result.data
  }
}

function processMessage(ws: WebSocket, data: RawData): ServerMessage<'ack'> {
  try {
    const msg = parseMessage(data)
    const { type, txid } = msg
    try {
      switch (type) {
        case 'identify': {
          SWITCHBOARD.identify(ws, msg.uid)
          break
        }
        case 'subscribe': {
          SWITCHBOARD.subscribe(ws, ...msg.topics)
          break
        }
        case 'unsubscribe': {
          SWITCHBOARD.unsubscribe(ws, ...msg.topics)
          break
        }
        case 'ping': {
          SWITCHBOARD.markSeen(ws)
          break
        }
        default:
          throw new Error("Unknown message type; shouldn't be possible here.")
      }
    } catch (err) {
      log.error(err)
      return { type: 'ack', txid, success: false, error: serializeError(err) }
    }
    return { type: 'ack', txid, success: true }
  } catch (err) {
    log.error(err)
    return { type: 'ack', success: false, error: serializeError(err) }
  }
}

function getRedisUrlForLogging() {
  if (REDIS_URL == null) return undefined

  try {
    const parsed = new URL(REDIS_URL)
    const auth = parsed.username || parsed.password ? '<redacted>@' : ''
    return `${parsed.protocol}//${auth}${parsed.hostname}:${
      parsed.port || '6379'
    }`
  } catch {
    return '<invalid redis url>'
  }
}

function getRedisErrorDetails(err: unknown) {
  if (err == null || typeof err !== 'object') return { error: err }
  const e = err as {
    name?: unknown
    message?: unknown
    code?: unknown
    errno?: unknown
    syscall?: unknown
    address?: unknown
    port?: unknown
    command?: unknown
    cause?: unknown
  }
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    errno: e.errno,
    syscall: e.syscall,
    address: e.address,
    port: e.port,
    command: e.command,
    cause: e.cause,
  }
}

function getRedisLogContext() {
  return {
    component: 'websocket-broadcast',
    enabled: redisBroadcastsEnabled(),
    url: getRedisUrlForLogging(),
    channel: getRedisBroadcastChannel(),
    env: getRedisBroadcastEnvironment(),
    project: process.env.GOOGLE_CLOUD_PROJECT,
    firebaseEnv: process.env.NEXT_PUBLIC_FIREBASE_ENV,
    instanceId: WEBSOCKET_INSTANCE_ID,
    host: localHost,
  }
}

const lastRedisProblemLog = new Map<string, number>()
// node-redis reports every failed reconnect attempt; log each problem at most
// once a minute.
function logRedisProblem(message: string, err: unknown) {
  const now = Date.now()
  if (
    now - (lastRedisProblemLog.get(message) ?? -Infinity) <
    REDIS_LOG_INTERVAL_MS
  )
    return
  lastRedisProblemLog.set(message, now)
  log.error(message, { ...getRedisErrorDetails(err), ...getRedisLogContext() })
}

function getRedisBroadcastEnvironment() {
  const firebaseEnv = process.env.NEXT_PUBLIC_FIREBASE_ENV
  if (firebaseEnv != null && firebaseEnv.trim().length > 0) {
    return firebaseEnv.trim().toLowerCase()
  }

  return process.env.GOOGLE_CLOUD_PROJECT === 'mantic-markets' ? 'prod' : 'dev'
}

function getRedisBroadcastChannel() {
  return `${DEFAULT_REDIS_BROADCAST_CHANNEL_PREFIX}-${getRedisBroadcastEnvironment()}`
}

function redisBroadcastsEnabled() {
  return REDIS_URL != null
}

const redisSocketOptions = {
  connectTimeout: 5_000,
  reconnectStrategy: (retries: number) => Math.min(500 * 2 ** retries, 30_000),
}

function recordBroadcastMetrics(topics: string[]) {
  for (const topic of topics) {
    const topicCategory = getTopicCategory(topic)
    metrics.inc('ws/broadcasts_sent', { category: topicCategory })
  }
}

function sendToLocalSubscribers(
  topic: string,
  msg: ServerMessage<'broadcast'> & { topics?: string[] }
) {
  const json = JSON.stringify(msg)
  const subscribers = SWITCHBOARD.getSubscribers(topic)
  return Promise.allSettled(
    subscribers.map(
      ([ws, _]) =>
        new Promise<void>((resolve) =>
          ws.send(json, (err) => {
            if (err) log.error('Broadcast error', { error: err })
            resolve()
          })
        )
    )
  ).catch((err) => log.error('Broadcast failed', { error: err }))
}

function sendToLocalSubscribersMulti(topics: string[], data: BroadcastPayload) {
  // ian: Don't await this: we don't need to hear back from all the clients and can take a dozen ms

  // mqp: it isn't secure to do this in prod because we rely on security-through-
  // topic-id-obscurity for unlisted contracts. but it's super convenient for testing
  if (LOCAL_DEV) {
    sendToLocalSubscribers('*', { type: 'broadcast', topic: '*', topics, data })
  }

  for (const topic of topics) {
    sendToLocalSubscribers(topic, { type: 'broadcast', topic, data })
  }
}

function parseRedisBroadcast(message: string) {
  const parsed = JSON.parse(message) as RedisBroadcast
  const kind = parsed.kind ?? 'event'
  if (!['event', 'heartbeat', 'shutdown'].includes(kind)) {
    throw new Error('Redis websocket broadcast has an unknown kind.')
  }
  if (parsed.eventSeq != null && !Number.isInteger(parsed.eventSeq)) {
    throw new Error('Redis websocket broadcast sequence is invalid.')
  }
  if (parsed.host != null && typeof parsed.host !== 'string') {
    throw new Error('Redis websocket broadcast host is invalid.')
  }
  if (
    parsed.originInstanceId != null &&
    typeof parsed.originInstanceId !== 'string'
  ) {
    throw new Error('Redis websocket broadcast origin instance ID is invalid.')
  }
  if (kind === 'event') {
    if (!Array.isArray(parsed.topics)) {
      throw new Error('Redis websocket broadcast has no topics array.')
    }
    for (const topic of parsed.topics) {
      if (typeof topic !== 'string') {
        throw new Error('Redis websocket broadcast topic is not a string.')
      }
    }
    if (parsed.data == null || typeof parsed.data !== 'object') {
      throw new Error('Redis websocket broadcast has invalid data.')
    }
  }
  return { ...parsed, kind }
}

function startRedisPublisher() {
  if (REDIS_URL == null || redisPublisher != null) return
  log.info(
    'Starting Redis websocket publisher connection.',
    getRedisLogContext()
  )
  const publisher = createClient({
    url: REDIS_URL,
    // Best effort: while disconnected, drop broadcasts at once instead of
    // queueing them in memory or making callers wait for a connection.
    disableOfflineQueue: true,
    socket: redisSocketOptions,
  })
  redisPublisher = publisher
  publisher.on('error', (err: unknown) => {
    metrics.inc('ws/redis_publisher_errors')
    logRedisProblem('Redis websocket publisher error.', err)
  })
  publisher.on('ready', () => {
    log.info('Redis websocket publisher connected.', getRedisLogContext())
  })
  publisher.connect().catch((err: unknown) => {
    logRedisProblem('Failed to start Redis websocket publisher.', err)
  })
}

function stopRedisPublisher() {
  const publisher = redisPublisher
  redisPublisher = undefined
  if (publisher == null) return
  const stop = publisher.isReady ? publisher.quit() : publisher.disconnect()
  stop.catch((err: unknown) => {
    logRedisProblem('Failed to stop Redis websocket publisher.', err)
  })
}

// Resolves to whether the message was handed to Redis. Never waits for a
// connection: a message sent while disconnected is dropped, and the sequence
// numbers let the other writers notice.
function publishToRedis(
  message: Omit<RedisBroadcast, 'originInstanceId' | 'host'>
) {
  startRedisPublisher()
  const publisher = redisPublisher
  if (!publisher?.isReady) {
    metrics.inc('ws/redis_broadcast_publish_errors')
    return Promise.resolve(false)
  }
  const payload: RedisBroadcast = {
    originInstanceId: WEBSOCKET_INSTANCE_ID,
    host: localHost,
    ...message,
  }
  return publisher
    .publish(getRedisBroadcastChannel(), JSON.stringify(payload))
    .then(
      () => {
        metrics.inc('ws/redis_broadcasts_published')
        return true
      },
      (err: unknown) => {
        metrics.inc('ws/redis_broadcast_publish_errors')
        logRedisProblem('Redis websocket broadcast failed.', err)
        return false
      }
    )
}

// Tracks another writer's broadcast count. The sender stays complete while
// every broadcast it numbered reached this writer: none was sent before it was
// first heard while clients were connected here, and none went missing since.
function trackSender({
  originInstanceId,
  host,
  kind,
  eventSeq,
}: ReturnType<typeof parseRedisBroadcast>) {
  if (originInstanceId == null) return
  const seq = eventSeq ?? NaN
  // How many broadcasts the sender had numbered before this message.
  const before = kind === 'event' ? seq - 1 : seq
  let sender = senders.get(originInstanceId)
  if (sender == null) {
    sender = {
      host: host ?? '',
      lastEventSeq: before,
      complete:
        Number.isInteger(seq) &&
        (before === 0 || SWITCHBOARD.clients.size === 0),
      shutDown: false,
    }
    senders.set(originInstanceId, sender)
  } else if (before !== sender.lastEventSeq) {
    sender.complete = false
  }
  if (host) sender.host = host
  if (Number.isInteger(seq)) sender.lastEventSeq = seq
  if (kind === 'shutdown') sender.shutDown = true
}

function handleRedisBroadcast(message: string) {
  try {
    const broadcast = parseRedisBroadcast(message)
    metrics.inc('ws/redis_broadcasts_received')
    if (broadcast.originInstanceId === WEBSOCKET_INSTANCE_ID) return
    trackSender(broadcast)
    if (broadcast.kind === 'event' && broadcast.topics && broadcast.data) {
      sendToLocalSubscribersMulti(broadcast.topics, broadcast.data)
    }
  } catch (err: unknown) {
    log.error('Error handling Redis websocket broadcast.', {
      ...getRedisErrorDetails(err),
      ...getRedisLogContext(),
    })
    metrics.inc('ws/redis_broadcast_parse_errors')
  }
}

function clearRedisSubscriberRetry() {
  if (redisSubscriberRetryTimeout != null) {
    clearTimeout(redisSubscriberRetryTimeout)
    redisSubscriberRetryTimeout = undefined
  }
}

function resetRedisSubscriberRetryDelay() {
  redisSubscriberRetryDelayMs = REDIS_SUBSCRIBER_INITIAL_RETRY_DELAY_MS
}

function scheduleRedisSubscriberRetry() {
  if (!redisSubscriberShouldRun || !redisBroadcastsEnabled()) return
  if (redisSubscriberRetryTimeout != null) return

  const delayMs = redisSubscriberRetryDelayMs
  redisSubscriberRetryDelayMs = Math.min(
    redisSubscriberRetryDelayMs * 2,
    REDIS_SUBSCRIBER_MAX_RETRY_DELAY_MS
  )
  log.warn('Retrying Redis websocket subscriber.', {
    delayMs,
    ...getRedisLogContext(),
  })
  redisSubscriberRetryTimeout = setTimeout(() => {
    redisSubscriberRetryTimeout = undefined
    startRedisBroadcastSubscriber()
  }, delayMs)
}

function startRedisBroadcastSubscriber() {
  if (REDIS_URL == null) {
    log.info('Redis websocket broadcasts disabled.', getRedisLogContext())
    return
  }
  redisSubscriberShouldRun = true
  if (redisSubscriberConnect != null || redisSubscriberRetryTimeout != null)
    return

  const channel = getRedisBroadcastChannel()
  log.info(
    'Starting Redis websocket subscriber connection.',
    getRedisLogContext()
  )
  const subscriber = createClient({
    url: REDIS_URL,
    socket: redisSocketOptions,
  })
  redisSubscriber = subscriber
  subscriber.on('error', (err: unknown) => {
    metrics.inc('ws/redis_subscriber_errors')
    logRedisProblem('Redis websocket subscriber error.', err)
  })

  redisSubscriberConnect = subscriber
    .connect()
    .then(() => subscriber.subscribe(channel, handleRedisBroadcast))
    .then(() => {
      resetRedisSubscriberRetryDelay()
      log.info('Redis websocket subscriber listening.', getRedisLogContext())
    })
    .catch((err: unknown) => {
      if (redisSubscriber === subscriber) redisSubscriber = undefined
      redisSubscriberConnect = undefined
      subscriber.disconnect().catch(() => {})
      logRedisProblem('Failed to start Redis websocket subscriber.', err)
      metrics.inc('ws/redis_subscriber_start_errors')
      scheduleRedisSubscriberRetry()
    })
}

function stopRedisBroadcastSubscriber() {
  log.info('Stopping Redis websocket subscriber.', getRedisLogContext())
  redisSubscriberShouldRun = false
  clearRedisSubscriberRetry()
  resetRedisSubscriberRetryDelay()
  const subscriber = redisSubscriber
  redisSubscriber = undefined
  redisSubscriberConnect = undefined
  if (subscriber == null) return
  const stop = subscriber.isReady ? subscriber.quit() : subscriber.disconnect()
  stop.catch((err: unknown) => {
    logRedisProblem('Failed to stop Redis websocket subscriber.', err)
  })
}

export function broadcastMulti(topics: string[], data: BroadcastPayload) {
  recordBroadcastMetrics(topics)
  sendToLocalSubscribersMulti(topics, data)

  if (redisBroadcastsEnabled()) {
    eventSeq++
    void publishToRedis({ kind: 'event', eventSeq, topics, data })
  }
}

export function broadcast(topic: string, data: BroadcastPayload) {
  return broadcastMulti([topic], data)
}

/** The VM instance name a deploy's handover uses to refer to this writer. */
export function setWebSocketInstanceName(name: string) {
  localHost = name
}

/**
 * Tells the other writers this process has sent its last broadcast, so their
 * handover can trust what they received from it. Call before exiting.
 */
export async function announceWebSocketShutdown() {
  if (!redisPublisher?.isReady) return
  const timeout = new AbortController()
  await Promise.race([
    publishToRedis({ kind: 'shutdown', eventSeq }).finally(() =>
      timeout.abort()
    ),
    sleep(REDIS_SHUTDOWN_TIMEOUT_MS, undefined, {
      signal: timeout.signal,
    }).catch(() => {}),
  ])
}

// Iterate the switchboard, not wss.clients: ws tracks a socket from the upgrade
// until its close handshake ends, which need not match the switchboard, and
// getClient throws for a socket the switchboard does not know.
function sweepStaleConnections() {
  const now = Date.now()
  for (const [ws, client] of SWITCHBOARD.getAll()) {
    if (client.lastSeen < now - CONNECTION_TIMEOUT_MS) ws.terminate()
  }
}

/** Closes every connected socket; each leaves once its handshake completes. */
export function closeAllConnections(code: number, reason: string) {
  let closed = 0
  for (const [ws] of SWITCHBOARD.getAll()) {
    ws.close(code, reason)
    closed++
  }
  return closed
}

// Why this writer's clients may have missed broadcasts from the writer on VM
// `retired`, or undefined if every one of them arrived.
function missedBroadcastsFrom(retired: string) {
  if (!redisBroadcastsEnabled()) return 'shared broadcasts are disabled here'
  const streams = [...senders.values()].filter((s) => s.host === retired)
  if (streams.length === 0) return `never heard from ${retired}`
  if (streams.some((s) => !s.shutDown)) {
    return `${retired} did not announce its shutdown`
  }
  if (streams.some((s) => !s.complete))
    return `missed broadcasts from ${retired}`
  return undefined
}

/**
 * During a deploy two writers serve at once, relaying their broadcasts to each
 * other through Redis. When the deploy reports the other writer's VM gone,
 * keep this writer's connections if every broadcast from it arrived here.
 * Otherwise close them all, so clients reconnect and backfill what they may
 * have missed.
 */
export function watchWebSocketHandover(wss: WebSocketServer) {
  const stop = watchHandover((retired) => {
    const missed = missedBroadcastsFrom(retired)
    for (const [id, sender] of senders) {
      if (sender.host === retired) senders.delete(id)
    }
    if (missed == null) {
      log.info(
        'Writer handover: every broadcast from the old writer arrived.',
        {
          retired,
        }
      )
      return
    }
    const closed = closeAllConnections(
      HANDOVER_CLOSE_CODE,
      'Writer handover; reconnect and backfill'
    )
    log.info(
      'Writer handover: closed connections that may have missed broadcasts.',
      {
        retired,
        missed,
        closed,
      }
    )
  })
  wss.on('close', stop)
  return stop
}

export function listen(server: HttpServer, path: string) {
  startRedisBroadcastSubscriber()
  let heartbeat: NodeJS.Timeout | undefined
  if (redisBroadcastsEnabled()) {
    startRedisPublisher()
    heartbeat = setInterval(
      () => void publishToRedis({ kind: 'heartbeat', eventSeq }),
      REDIS_HEARTBEAT_MS
    )
  }
  const wss = new WebSocketServer({ server, path })
  let deadConnectionCleaner: NodeJS.Timeout | undefined
  wss.on('listening', () => {
    log.info(`Web socket server listening on ${path}.`)
    deadConnectionCleaner = setInterval(
      sweepStaleConnections,
      CONNECTION_TIMEOUT_MS
    )
  })
  wss.on('error', (err) => {
    log.error('Error on websocket server.', { error: err })
  })
  wss.on('connection', (ws) => {
    // todo: should likely kill connections that haven't sent any ping for a long time
    metrics.inc('ws/connections_established')
    metrics.set('ws/open_connections', wss.clients.size)
    log.debug('WS client connected.')
    SWITCHBOARD.connect(ws)
    ws.on('message', (data) => {
      const result = processMessage(ws, data)
      // mqp: check ws.readyState before sending?
      ws.send(JSON.stringify(result))
    })
    ws.on('close', (code, reason) => {
      metrics.inc('ws/connections_terminated')
      metrics.set('ws/open_connections', wss.clients.size)
      log.debug(`WS client disconnected.`, { code, reason: reason.toString() })
      SWITCHBOARD.disconnect(ws)
    })
    ws.on('error', (err) => {
      log.error('Error on websocket connection.', { error: err })
    })
  })
  wss.on('close', function close() {
    clearInterval(deadConnectionCleaner)
    clearInterval(heartbeat)
    stopRedisBroadcastSubscriber()
    stopRedisPublisher()
  })
  return wss
}
