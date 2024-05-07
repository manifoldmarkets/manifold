import {
  ClientMessage,
  ClientMessageType,
  ServerMessage,
} from 'common/api/websockets'
import { getApiUrl } from 'common/api/utils'

// mqp: useful for debugging
const VERBOSE_LOGGING = true

export type BroadcastHandler = (msg: ServerMessage<'broadcast'>) => void

export class APIRealtimeClient {
  ws!: WebSocket
  url: string
  txid: number
  subscriptions: Map<string, BroadcastHandler[]>
  heartbeat?: NodeJS.Timeout

  constructor(url: string) {
    this.url = url
    this.txid = 0
    this.subscriptions = new Map()
    this.reconnect()
  }

  get state() {
    return this.ws.readyState
  }

  close() {
    this.ws.close(1000, 'Closed manually.')
  }

  reconnect() {
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (ev) => {
      this.receiveMessage(ev.data)
    }
    this.ws.onerror = (ev) => {
      console.error('API websocket error: ', ev)
    }
    this.ws.onopen = (_ev) => {
      if (VERBOSE_LOGGING) {
        console.info('API websocket opened.')
      }
      this.heartbeat = setInterval(() => this.sendMessage('ping', {}), 30000)
      if (this.subscriptions.size > 0) {
        this.sendMessage('subscribe', {
          topics: Array.from(this.subscriptions.keys()),
        })
      }
    }
    this.ws.onclose = (ev) => {
      if (VERBOSE_LOGGING) {
        console.info(`API websocket closed with code=${ev.code}: ${ev.reason}`)
      }
      clearInterval(this.heartbeat)
      // 1000 is RFC code for normal on-purpose closure
      if (ev.code !== 1000) {
        // mqp: extremely simple reconnect policy
        setTimeout(() => this.reconnect(), 5000)
      }
    }
  }

  receiveMessage(msg: ServerMessage) {
    if (VERBOSE_LOGGING) {
      console.info('< Incoming API websocket message: ', msg)
    }
    switch (msg.type) {
      case 'broadcast': {
        const handlers = this.subscriptions.get(msg.topic)
        if (handlers == null) {
          // it's not exceptional for a message to come in with no handlers --
          // maybe the server didn't get our unsubscribe yet
          return
        }
        for (const handler of handlers) {
          handler(msg)
        }
        return
      }
      case 'ack': {
        // no need to do anything in particular... might want to manage acks for
        // our messages later
      }
      default:
        console.warn(`Unknown API websocket message type received: ${msg.type}`)
    }
  }

  sendMessage<T extends ClientMessageType>(
    type: T,
    data: Omit<ClientMessage<T>, 'type' | 'txid'>
  ) {
    if (VERBOSE_LOGGING) {
      console.info(`> Outgoing API websocket ${type} message: `, data)
    }
    if (this.state === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, txid: this.txid++, ...data }))
    }
  }

  identify(uid: string) {
    this.sendMessage('identify', { uid })
  }

  subscribe(topics: string[], handler: BroadcastHandler) {
    for (const topic of topics) {
      let existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        this.subscriptions.set(topic, (existingHandlers = []))
        this.sendMessage('subscribe', { topics: [topic] })
      }
      existingHandlers.push(handler)
    }
  }

  unsubscribe(topics: string[], handler: BroadcastHandler) {
    for (const topic of topics) {
      const existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        console.error(`Subscription mapping busted -- ${topic} handlers null.`)
      } else {
        const remainingHandlers = existingHandlers.filter((h) => h != handler)
        if (remainingHandlers.length > 0) {
          this.subscriptions.set(topic, remainingHandlers)
        } else {
          this.subscriptions.delete(topic)
          this.sendMessage('unsubscribe', { topics: [topic] })
        }
      }
    }
  }
}

export const client = new APIRealtimeClient(getApiUrl('ws'))
