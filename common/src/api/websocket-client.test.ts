import { APIRealtimeClient } from './websocket-client'

// Minimal stand-in for the browser WebSocket, driven by hand so tests can open,
// drop and reopen the connection deterministically.
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  sent: any[] = []
  onopen: ((ev: any) => void) | null = null
  onclose: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null
  onmessage: ((ev: any) => void) | null = null
  onSend?: (msg: any) => void

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    const msg = JSON.parse(data)
    this.sent.push(msg)
    this.onSend?.(msg)
  }

  close(_code?: number, _reason?: string) {
    this.readyState = FakeWebSocket.CLOSED
  }

  // Test controls.
  opened() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  dropped(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason: '' })
  }

  get subscribeTopics() {
    return this.sent
      .filter((m) => m.type === 'subscribe')
      .flatMap((m) => m.topics as string[])
  }
}

describe('APIRealtimeClient reconnects', () => {
  let client: APIRealtimeClient

  const latestSocket = () =>
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

  // The client waits for an ack on every message it sends; without one the
  // txn times out and logs. Ack immediately so tests stay quiet.
  const autoAck = (socket: FakeWebSocket) => {
    socket.onSend = (msg) => {
      if (msg.txid != null) {
        client.receiveMessage({ type: 'ack', txid: msg.txid, success: true })
      }
    }
  }

  const connect = () => {
    const socket = latestSocket()
    autoAck(socket)
    socket.opened()
    return socket
  }

  beforeEach(() => {
    jest.useFakeTimers()
    FakeWebSocket.instances = []
    ;(global as any).WebSocket = FakeWebSocket
    client = new APIRealtimeClient('ws://test')
  })

  afterEach(() => {
    client.close()
    jest.clearAllTimers()
    jest.useRealTimers()
    delete (global as any).WebSocket
  })

  it('does not count the first connection as a reconnect', () => {
    const listener = jest.fn()
    client.onReconnect(listener)

    connect()

    expect(client.reconnectCount).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('counts each time the socket comes back', () => {
    const listener = jest.fn()
    client.onReconnect(listener)
    connect()

    latestSocket().dropped()
    jest.advanceTimersByTime(5000)
    connect()

    expect(client.reconnectCount).toBe(1)
    expect(listener).toHaveBeenCalledWith(1)

    latestSocket().dropped()
    jest.advanceTimersByTime(5000)
    connect()

    expect(client.reconnectCount).toBe(2)
    expect(listener).toHaveBeenLastCalledWith(2)
  })

  it('has already asked to resubscribe by the time listeners run', () => {
    connect()
    client.subscribe(['contract/abc/orders'], jest.fn())

    let topicsWhenNotified: string[] = []
    client.onReconnect(() => {
      topicsWhenNotified = latestSocket().subscribeTopics
    })

    latestSocket().dropped()
    jest.advanceTimersByTime(5000)
    connect()

    // Otherwise a refetch could snapshot the server before our topics are back
    // on, and miss anything that changed in between.
    expect(topicsWhenNotified).toContain('contract/abc/orders')
  })

  it('stops notifying once the listener unsubscribes', () => {
    const listener = jest.fn()
    const unsubscribe = client.onReconnect(listener)
    connect()

    unsubscribe()
    latestSocket().dropped()
    jest.advanceTimersByTime(5000)
    connect()

    expect(client.reconnectCount).toBe(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not count a deliberate close as a reconnect', () => {
    const listener = jest.fn()
    client.onReconnect(listener)
    connect()

    // 1000 is a normal on-purpose closure, so the client stays down.
    latestSocket().dropped(1000)
    jest.advanceTimersByTime(5000)

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(listener).not.toHaveBeenCalled()
  })
})
