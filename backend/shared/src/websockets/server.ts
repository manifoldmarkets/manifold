import { randomUUID } from 'node:crypto'
import { Server as HttpServer } from 'node:http'
import { createClient } from '@redis/client'
import { Server as WebSocketServer, RawData, WebSocket } from 'ws'
import { isError } from 'lodash'
import { LOCAL_DEV, log, metrics } from 'shared/utils'
import { Switchboard } from './switchboard'
import {
  BroadcastPayload,
  ClientMessage,
  ServerMessage,
  CLIENT_MESSAGE_SCHEMA,
} from 'common/api/websockets'

const SWITCHBOARD = new Switchboard()

// if a connection doesn't ping for this long, we assume the other side is toast
const CONNECTION_TIMEOUT_MS = 60 * 1000
const DEFAULT_REDIS_BROADCAST_CHANNEL_PREFIX = 'api-websocket-broadcasts'
const REDIS_SUBSCRIBER_INITIAL_RETRY_DELAY_MS = 1_000
const REDIS_SUBSCRIBER_MAX_RETRY_DELAY_MS = 60_000
const WEBSOCKET_INSTANCE_ID = randomUUID()

type RedisBroadcast = {
  originInstanceId?: string
  topics: string[]
  data: BroadcastPayload
}

type RedisClient = ReturnType<typeof createClient>

let redisPublisher: RedisClient | undefined
let redisPublisherConnect: Promise<RedisClient> | undefined
let redisSubscriber: RedisClient | undefined
let redisSubscriberConnect: Promise<void> | undefined
let redisSubscriberShouldRun = false
let redisSubscriberRetryTimeout: NodeJS.Timeout | undefined
let redisSubscriberRetryDelayMs = REDIS_SUBSCRIBER_INITIAL_RETRY_DELAY_MS

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

function getRedisUrl() {
  const url = process.env.REDIS_URL
  return url && url.trim().length > 0 ? url : undefined
}

function getRedisUrlForLogging() {
  const url = getRedisUrl()
  if (url == null) return undefined

  try {
    const parsed = new URL(url)
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
  }
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
  return getRedisUrl() != null
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
  if (
    parsed.originInstanceId != null &&
    typeof parsed.originInstanceId !== 'string'
  ) {
    throw new Error('Redis websocket broadcast origin instance ID is invalid.')
  }
  return parsed
}

function resetRedisPublisher() {
  redisPublisher = undefined
  redisPublisherConnect = undefined
}

async function getRedisPublisher() {
  if (!redisBroadcastsEnabled()) return undefined
  if (redisPublisherConnect != null) return await redisPublisherConnect

  const url = getRedisUrl()
  if (url == null) return undefined

  log.info(
    'Starting Redis websocket publisher connection.',
    getRedisLogContext()
  )
  redisPublisher = createClient({ url })
  redisPublisher.on('error', (err: unknown) => {
    log.error('Redis websocket publisher error.', {
      ...getRedisErrorDetails(err),
      ...getRedisLogContext(),
    })
    metrics.inc('ws/redis_publisher_errors')
  })
  redisPublisher.on('reconnecting', () => {
    log.warn('Redis websocket publisher reconnecting.', getRedisLogContext())
  })

  redisPublisherConnect = redisPublisher
    .connect()
    .then(() => {
      log.info('Redis websocket publisher connected.', getRedisLogContext())
      return redisPublisher!
    })
    .catch((err: unknown) => {
      resetRedisPublisher()
      log.error('Failed to start Redis websocket publisher.', {
        ...getRedisErrorDetails(err),
        ...getRedisLogContext(),
      })
      throw err
    })

  return await redisPublisherConnect
}

async function publishRedisBroadcast(topics: string[], data: BroadcastPayload) {
  const publisher = await getRedisPublisher()
  if (publisher == null) return

  const broadcast: RedisBroadcast = {
    originInstanceId: WEBSOCKET_INSTANCE_ID,
    topics,
    data,
  }
  await publisher.publish(getRedisBroadcastChannel(), JSON.stringify(broadcast))
  metrics.inc('ws/redis_broadcasts_published')
}

function handleRedisBroadcast(message: string) {
  try {
    const { originInstanceId, topics, data } = parseRedisBroadcast(message)
    metrics.inc('ws/redis_broadcasts_received')
    if (originInstanceId === WEBSOCKET_INSTANCE_ID) return
    sendToLocalSubscribersMulti(topics, data)
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
  if (!redisBroadcastsEnabled()) {
    log.info('Redis websocket broadcasts disabled.', getRedisLogContext())
    return
  }
  redisSubscriberShouldRun = true
  if (redisSubscriberConnect != null || redisSubscriberRetryTimeout != null)
    return

  const url = getRedisUrl()
  if (url == null) return

  const channel = getRedisBroadcastChannel()
  log.info(
    'Starting Redis websocket subscriber connection.',
    getRedisLogContext()
  )
  const subscriber = createClient({ url })
  redisSubscriber = subscriber
  subscriber.on('error', (err: unknown) => {
    log.error('Redis websocket subscriber error.', {
      ...getRedisErrorDetails(err),
      ...getRedisLogContext(),
    })
    metrics.inc('ws/redis_subscriber_errors')
  })
  subscriber.on('reconnecting', () => {
    log.warn('Redis websocket subscriber reconnecting.', getRedisLogContext())
  })

  redisSubscriberConnect = subscriber
    .connect()
    .then(() => subscriber.subscribe(channel, handleRedisBroadcast))
    .then(() => {
      resetRedisSubscriberRetryDelay()
      log.info('Redis websocket subscriber connected.', getRedisLogContext())
      log.info('Redis websocket subscriber listening.', getRedisLogContext())
    })
    .catch((err: unknown) => {
      if (redisSubscriber === subscriber) redisSubscriber = undefined
      redisSubscriberConnect = undefined
      subscriber.quit().catch((quitErr: unknown) => {
        log.error('Failed to quit Redis websocket subscriber.', {
          ...getRedisErrorDetails(quitErr),
          ...getRedisLogContext(),
        })
      })
      log.error('Failed to start Redis websocket subscriber.', {
        ...getRedisErrorDetails(err),
        ...getRedisLogContext(),
      })
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
  subscriber?.quit().catch((err: unknown) => {
    log.error('Failed to quit Redis websocket subscriber.', {
      ...getRedisErrorDetails(err),
      ...getRedisLogContext(),
    })
  })
}

export function broadcastMulti(topics: string[], data: BroadcastPayload) {
  recordBroadcastMetrics(topics)
  sendToLocalSubscribersMulti(topics, data)

  if (redisBroadcastsEnabled()) {
    publishRedisBroadcast(topics, data).catch((err: unknown) => {
      log.error('Redis websocket broadcast failed.', {
        ...getRedisErrorDetails(err),
        ...getRedisLogContext(),
      })
      metrics.inc('ws/redis_broadcast_publish_errors')
    })
  }
}

export function broadcast(topic: string, data: BroadcastPayload) {
  return broadcastMulti([topic], data)
}

export function listen(server: HttpServer, path: string) {
  startRedisBroadcastSubscriber()
  const wss = new WebSocketServer({ server, path })
  let deadConnectionCleaner: NodeJS.Timeout | undefined
  wss.on('listening', () => {
    log.info(`Web socket server listening on ${path}.`)
    deadConnectionCleaner = setInterval(function ping() {
      const now = Date.now()
      for (const ws of wss.clients) {
        const lastSeen = SWITCHBOARD.getClient(ws).lastSeen
        if (lastSeen < now - CONNECTION_TIMEOUT_MS) {
          ws.terminate()
        }
      }
    }, CONNECTION_TIMEOUT_MS)
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
    stopRedisBroadcastSubscriber()
  })
  return wss
}
