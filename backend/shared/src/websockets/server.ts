import { Server as HttpServer } from 'node:http'
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

export function broadcastMulti(topics: string[], data: BroadcastPayload) {
  // ian: Don't await this: we don't need to hear back from all the clients and can take a dozen ms
  const sendToSubscribers = (topic: string, msg: any) => {
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

  // mqp: it isn't secure to do this in prod because we rely on security-through-
  // topic-id-obscurity for unlisted contracts. but it's super convenient for testing
  if (LOCAL_DEV) {
    const msg = { type: 'broadcast', topic: '*', topics, data }
    sendToSubscribers('*', msg)
  }

  for (const topic of topics) {
    const msg = { type: 'broadcast', topic, data }
    sendToSubscribers(topic, msg)
    // Categorize topics to avoid unbounded cardinality
    const topicCategory = getTopicCategory(topic)
    metrics.inc('ws/broadcasts_sent', { category: topicCategory })
  }
}

export function broadcast(topic: string, data: BroadcastPayload) {
  return broadcastMulti([topic], data)
}

export function listen(server: HttpServer, path: string) {
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
  })
  return wss
}
