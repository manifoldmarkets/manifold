import { ClientMessage, ClientMessageType, ServerMessage } from './websockets'

// mqp: useful for debugging
const VERBOSE_LOGGING = false

// mqp: no way should our server ever take 5 seconds to reply
const TIMEOUT_MS = 5000
const HEARTBEAT_MS = 10_000
const RECONNECT_WAIT_MS = 5000

type ConnectingState = typeof WebSocket.CONNECTING
type OpenState = typeof WebSocket.OPEN
type ClosingState = typeof WebSocket.CLOSING
type ClosedState = typeof WebSocket.CLOSED

export type ReadyState =
  | OpenState
  | ConnectingState
  | ClosedState
  | ClosingState

export function formatState(state: ReadyState) {
  switch (state) {
    case WebSocket.CONNECTING:
      return 'connecting'
    case WebSocket.OPEN:
      return 'open'
    case WebSocket.CLOSING:
      return 'closing'
    case WebSocket.CLOSED:
      return 'closed'
    default:
      throw new Error('Invalid websocket state.')
  }
}

export type BroadcastHandler = (msg: ServerMessage<'broadcast'>) => void

type OutstandingTxn = {
  resolve: () => void
  reject: (err: Error) => void
  timeout?: NodeJS.Timeout
}

/** Client for the API websocket realtime server. Automatically manages reconnection
 * and resubscription on disconnect, and allows subscribers to get a callback
 * when something is broadcasted. */
export class APIRealtimeClient {
  ws!: WebSocket
  url: string
  txid: number
  // all txns that are in flight, with no ack/error/timeout
  txns: Map<number, OutstandingTxn>
  // subscribers by the topic they are subscribed to
  subscriptions: Map<string, BroadcastHandler[]>
  connectTimeout?: NodeJS.Timeout
  heartbeat?: NodeJS.Timeout
  /** Incremented after each successful connection and resubscription. Resubscribing
   * doesn't backfill the broadcasts sent while we were away, so anything
   * caching server state should watch this and refetch. */
  reconnectCount: number
  private stopped = false
  private reconnectAttempt = 0
  private subscriptionRequests = new Map<string, Promise<void>>()
  private reconnectListeners: Set<(count: number) => void>

  constructor(url: string) {
    this.url = url
    this.txid = 0
    this.txns = new Map()
    this.subscriptions = new Map()
    this.reconnectCount = 0
    this.reconnectListeners = new Set()
    this.connect()
  }

  /** Returns an unsubscribe function. */
  onReconnect(listener: (count: number) => void) {
    this.reconnectListeners.add(listener)
    return () => {
      this.reconnectListeners.delete(listener)
    }
  }

  get state() {
    return this.ws.readyState as ReadyState
  }

  close() {
    this.stopped = true
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = undefined
    }
    this.ws.close(1000, 'Closed manually.')
    clearTimeout(this.connectTimeout)
  }

  connect() {
    // you may wish to refer to https://websockets.spec.whatwg.org/
    // in order to check the semantics of events etc.
    const socket = new WebSocket(this.url)
    this.ws = socket
    this.ws.onmessage = (ev) => {
      this.receiveMessage(JSON.parse(ev.data))
    }
    this.ws.onerror = (ev) => {
      console.error('API websocket error: ', ev)
      // Browser errors are followed by close. The timer guard coalesces both.
      this.waitAndReconnect()
    }
    this.ws.onopen = async () => {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = undefined
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(
        () => this.sendMessage('ping', {}).catch(console.error),
        HEARTBEAT_MS
      )
      try {
        if (this.subscriptions.size > 0) {
          const topics = Array.from(this.subscriptions.keys())
          const request = this.sendMessage('subscribe', { topics })
          for (const topic of topics)
            this.subscriptionRequests.set(topic, request)
          await request
        }
        if (
          this.stopped ||
          this.ws !== socket ||
          socket.readyState !== WebSocket.OPEN
        )
          return
        this.reconnectAttempt = 0
        // Also reconcile the first successful connection: the initial HTTP
        // read may have completed before this socket (or its retries) opened.
        this.reconnectCount++
        for (const listener of Array.from(this.reconnectListeners))
          listener(this.reconnectCount)
      } catch (error) {
        console.error('Failed to restore websocket subscriptions', error)
        if (!this.stopped && this.ws === socket) {
          socket.close()
          this.waitAndReconnect()
        }
      }
    }
    this.ws.onclose = (ev) => {
      if (this.ws !== socket) return
      // note that if the connection closes due to an error, onerror fires and then this
      if (VERBOSE_LOGGING) {
        console.info(`API websocket closed with code=${ev.code}: ${ev.reason}`)
      }
      clearInterval(this.heartbeat)

      // mqp: we might need to change how the txn stuff works if we ever want to
      // implement "wait until i am subscribed, and then do something" in a component.
      // right now it cannot be reliably used to detect that in the presence of reconnects
      for (const txn of Array.from(this.txns.values())) {
        clearTimeout(txn.timeout)
        txn.reject(new Error('Websocket was closed.'))
      }
      this.txns.clear()

      // 1000 is RFC code for normal on-purpose closure
      if (ev.code !== 1000) {
        this.waitAndReconnect()
      }
    }
  }

  waitAndReconnect() {
    if (!this.stopped && this.connectTimeout == null) {
      const cap = Math.min(
        30_000,
        RECONNECT_WAIT_MS * 2 ** Math.min(this.reconnectAttempt++, 3)
      )
      const delay = 1000 + Math.random() * (cap - 1000)
      this.connectTimeout = setTimeout(() => {
        this.connectTimeout = undefined
        this.connect()
      }, delay)
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
        if (msg.txid != null) {
          const txn = this.txns.get(msg.txid)
          if (txn == null) {
            // mqp: only reason this should happen is getting an ack after timeout
            console.warn(`Websocket message with old txid=${msg.txid}.`)
          } else {
            clearTimeout(txn.timeout)
            if (msg.error != null) {
              txn.reject(new Error(msg.error))
            } else {
              txn.resolve()
            }
            this.txns.delete(msg.txid)
          }
        }
        return
      }
      default:
        console.warn(`Unknown API websocket message type received: ${msg}`)
    }
  }

  async sendMessage<T extends ClientMessageType>(
    type: T,
    data: Omit<ClientMessage<T>, 'type' | 'txid'>
  ) {
    if (VERBOSE_LOGGING) {
      console.info(`> Outgoing API websocket ${type} message: `, data)
    }
    const socket = this.ws
    if (this.state === WebSocket.OPEN) {
      return new Promise<void>((resolve, reject) => {
        const txid = this.txid++
        const timeout = setTimeout(() => {
          this.txns.delete(txid)
          reject(new Error(`Websocket message with txid ${txid} timed out.`))
        }, TIMEOUT_MS)
        this.txns.set(txid, { resolve, reject, timeout })
        this.ws.send(JSON.stringify({ type, txid, ...data }))
      }).catch((error) => {
        // If this is a heartbeat message that failed, trigger reconnection
        if (
          (type === 'ping' || type === 'subscribe') &&
          this.ws === socket &&
          !this.stopped
        ) {
          console.error('Heartbeat failed, attempting to reconnect:', error)
          socket.close()
          this.waitAndReconnect()
        }
        throw error // Re-throw the error for other message types
      })
    } else {
      // expected if components in the code try to subscribe or unsubscribe
      // while the socket is closed -- in this case we expect to get the state
      // fixed up in the websocket onopen handler when we reconnect
    }
  }

  async identify(uid: string) {
    return await this.sendMessage('identify', { uid })
  }

  async subscribe(topics: string[], handler: BroadcastHandler) {
    const added: string[] = []
    for (const topic of topics) {
      const existing = this.subscriptions.get(topic)
      if (existing) existing.push(handler)
      else {
        this.subscriptions.set(topic, [handler])
        added.push(topic)
      }
    }
    if (added.length) {
      const request = this.sendMessage('subscribe', { topics: added })
      for (const topic of added) this.subscriptionRequests.set(topic, request)
    }
    // A second consumer of a topic must also wait for its pending subscribe.
    await Promise.all(
      topics.map((topic) => this.subscriptionRequests.get(topic))
    )
  }

  async unsubscribe(topics: string[], handler: BroadcastHandler) {
    const removed: string[] = []
    for (const topic of topics) {
      const remaining = (this.subscriptions.get(topic) ?? []).filter(
        (h) => h !== handler
      )
      if (remaining.length) this.subscriptions.set(topic, remaining)
      else {
        this.subscriptions.delete(topic)
        this.subscriptionRequests.delete(topic)
        removed.push(topic)
      }
    }
    if (removed.length)
      await this.sendMessage('unsubscribe', { topics: removed })
  }
}
