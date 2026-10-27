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
export type ConnectionHandler = (connected: boolean) => void

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
  private manuallyClosed = false
  private hasOpened = false
  private needsRecovery = false
  private subscriptionRevision = 0
  private connectionHandlers = new Set<ConnectionHandler>()
  private subscriptionsReady = false
  recoveryEpoch = 0

  constructor(url: string) {
    this.url = url
    this.txid = 0
    this.txns = new Map()
    this.subscriptions = new Map()
    this.connect()
  }

  get state() {
    return this.ws.readyState as ReadyState
  }

  close() {
    this.manuallyClosed = true
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = undefined
    }
    this.ws.close(1000, 'Closed manually.')
    clearTimeout(this.connectTimeout)
    this.connectTimeout = undefined
    this.invalidateConnection()
  }

  // true means all retained topics have been acknowledged on this socket.
  // false immediately invalidates any recovery fetch from the previous socket.
  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler)
    return () => {
      this.connectionHandlers.delete(handler)
    }
  }

  get isReady() {
    return this.subscriptionsReady && this.state === WebSocket.OPEN
  }

  private invalidateConnection() {
    this.subscriptionsReady = false
    for (const handler of this.connectionHandlers) handler(false)
    for (const txn of this.txns.values()) {
      clearTimeout(txn.timeout)
      txn.reject(new Error('Websocket was closed.'))
    }
    this.txns.clear()
  }

  private reconnectSocket(ws: WebSocket) {
    if (ws !== this.ws || this.manuallyClosed) return
    this.needsRecovery = true
    this.invalidateConnection()
    clearInterval(this.heartbeat)
    ws.close()
    this.waitAndReconnect()
  }

  connect() {
    this.manuallyClosed = false
    clearTimeout(this.connectTimeout)
    this.connectTimeout = undefined
    if (this.ws) {
      this.invalidateConnection()
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
    }
    // you may wish to refer to https://websockets.spec.whatwg.org/
    // in order to check the semantics of events etc.
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onmessage = (ev) => {
      if (ws !== this.ws || this.manuallyClosed) return
      this.receiveMessage(JSON.parse(ev.data))
    }
    ws.onerror = (ev) => {
      if (ws !== this.ws || this.manuallyClosed) return
      console.error('API websocket error: ', ev)
      // this can fire without an onclose if this is the first time we ever try
      // to connect, so we need to turn on our reconnect in that case
      this.reconnectSocket(ws)
    }
    ws.onopen = async (_ev) => {
      if (ws !== this.ws || this.manuallyClosed) return
      if (VERBOSE_LOGGING) {
        console.info('API websocket opened.')
      }
      if (this.heartbeat) {
        clearInterval(this.heartbeat)
      }
      this.heartbeat = setInterval(
        async () => this.sendMessage('ping', {}).catch(console.error),
        HEARTBEAT_MS
      )
      try {
        // Components can add topics while the first acknowledgement is in
        // flight. Do not declare recovery ready until that set is stable.
        let revision: number
        do {
          revision = this.subscriptionRevision
          if (this.subscriptions.size > 0)
            await this.sendMessage('subscribe', {
              topics: Array.from(this.subscriptions.keys()),
            })
          if (ws !== this.ws || ws.readyState !== WebSocket.OPEN) return
        } while (revision !== this.subscriptionRevision)
        this.subscriptionsReady = true
        const recover = this.hasOpened || this.needsRecovery
        this.hasOpened = true
        this.needsRecovery = false
        if (recover) {
          this.recoveryEpoch++
          for (const handler of this.connectionHandlers) handler(true)
        }
      } catch (error) {
        console.error('Websocket resubscription failed:', error)
        this.reconnectSocket(ws)
      }
    }
    ws.onclose = (ev) => {
      if (ws !== this.ws) return
      // note that if the connection closes due to an error, onerror fires and then this
      if (VERBOSE_LOGGING) {
        console.info(`API websocket closed with code=${ev.code}: ${ev.reason}`)
      }
      clearInterval(this.heartbeat)

      this.needsRecovery = true
      this.invalidateConnection()

      // 1000 is RFC code for normal on-purpose closure
      if (ev.code !== 1000 && !this.manuallyClosed) {
        this.waitAndReconnect()
      }
    }
  }

  waitAndReconnect() {
    if (this.connectTimeout == null && !this.manuallyClosed) {
      this.connectTimeout = setTimeout(() => {
        this.connectTimeout = undefined
        this.connect()
      }, RECONNECT_WAIT_MS)
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
            if (!msg.success || msg.error != null) {
              txn.reject(new Error(msg.error ?? 'Websocket request failed.'))
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
    if (this.state === WebSocket.OPEN) {
      const ws = this.ws
      return new Promise<void>((resolve, reject) => {
        const txid = this.txid++
        const timeout = setTimeout(() => {
          this.txns.delete(txid)
          reject(new Error(`Websocket message with txid ${txid} timed out.`))
        }, TIMEOUT_MS)
        this.txns.set(txid, { resolve, reject, timeout })
        try {
          ws.send(JSON.stringify({ type, txid, ...data }))
        } catch (error) {
          clearTimeout(timeout)
          this.txns.delete(txid)
          reject(error)
        }
      }).catch((error) => {
        // If this is a heartbeat message that failed, trigger reconnection
        if (type === 'ping' || type === 'subscribe') {
          console.error('Heartbeat failed, attempting to reconnect:', error)
          this.reconnectSocket(ws)
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
    // Register every topic locally first, then tell the server about the new
    // ones in a single message. (Returning from inside the loop used to drop
    // every topic after the first new one when several were passed at once.)
    const newTopics: string[] = []
    for (const topic of new Set(topics)) {
      const existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        this.subscriptions.set(topic, [handler])
        newTopics.push(topic)
      } else {
        existingHandlers.push(handler)
      }
    }
    if (newTopics.length > 0) {
      this.subscriptionRevision++
      return await this.sendMessage('subscribe', { topics: newTopics })
    }
  }

  async unsubscribe(topics: string[], handler: BroadcastHandler) {
    const droppedTopics: string[] = []
    for (const topic of new Set(topics)) {
      const existingHandlers = this.subscriptions.get(topic)
      if (existingHandlers == null) {
        console.error(`Subscription mapping busted -- ${topic} handlers null.`)
      } else {
        const remainingHandlers = existingHandlers.filter((h) => h != handler)
        if (remainingHandlers.length > 0) {
          this.subscriptions.set(topic, remainingHandlers)
        } else {
          this.subscriptions.delete(topic)
          droppedTopics.push(topic)
        }
      }
    }
    if (droppedTopics.length > 0) {
      this.subscriptionRevision++
      return await this.sendMessage('unsubscribe', { topics: droppedTopics })
    }
  }
}
