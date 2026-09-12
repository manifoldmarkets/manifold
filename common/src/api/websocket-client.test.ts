import { APIRealtimeClient } from './websocket-client'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  sent: any[] = []
  onopen: ((ev: any) => unknown) | null = null
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
  close(code = 1000) {
    this.dropped(code)
  }
  opened() {
    this.readyState = FakeWebSocket.OPEN
    return this.onopen?.({})
  }
  dropped(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason: '' })
  }
  failed() {
    this.onerror?.({})
    this.dropped()
  }
}

describe('APIRealtimeClient recovery', () => {
  let client: APIRealtimeClient
  const latest = () =>
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  const ack = (msg: any) =>
    client.receiveMessage({ type: 'ack', txid: msg.txid, success: true })
  const connect = async () => {
    latest().onSend = (msg) => {
      Promise.resolve().then(() => ack(msg))
    }
    await latest().opened()
  }
  const advance = async (ms: number) => {
    jest.advanceTimersByTime(ms)
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(1)
    jest.spyOn(console, 'error').mockImplementation(() => {})
    FakeWebSocket.instances = []
    ;(global as any).WebSocket = FakeWebSocket
    client = new APIRealtimeClient('ws://test')
  })
  afterEach(() => {
    client.close()
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete (global as any).WebSocket
  })
  it('reconciles the first successful connection and subsequent connections', async () => {
    const listener = jest.fn()
    client.onReconnect(listener)
    await connect()
    expect(listener).toHaveBeenLastCalledWith(1)
    latest().dropped()
    await advance(5000)
    await connect()
    expect(listener).toHaveBeenLastCalledWith(2)
  })
  it('waits for subscription acknowledgment before notifying', async () => {
    await client.subscribe(['contract/a/orders'], jest.fn())
    const listener = jest.fn()
    client.onReconnect(listener)
    const opened = latest().opened()
    expect(listener).not.toHaveBeenCalled()
    ack(latest().sent[0])
    await opened
    expect(listener).toHaveBeenCalledWith(1)
  })
  it('recovers from initial failures and coalesces error then close', async () => {
    latest().failed()
    await advance(5000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    await connect()
    expect(client.reconnectCount).toBe(1)
  })
  it('registers and unregisters every topic, preserving other consumers', async () => {
    await connect()
    const first = jest.fn(),
      second = jest.fn()
    await client.subscribe(['a', 'b', 'c'], first)
    await client.subscribe(['b'], second)
    expect(Array.from(client.subscriptions.keys())).toEqual(['a', 'b', 'c'])
    await client.unsubscribe(['a', 'b', 'c'], first)
    expect(Array.from(client.subscriptions.keys())).toEqual(['b'])
    expect(client.subscriptions.get('b')).toEqual([second])
    expect(latest().sent.at(-1).topics).toEqual(['a', 'c'])
  })
  it('makes concurrent consumers wait for the same pending subscription', async () => {
    await connect()
    latest().onSend = undefined
    const first = client.subscribe(['a'], jest.fn())
    const ready = jest.fn()
    const second = client.subscribe(['a'], jest.fn()).then(ready)
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    ack(latest().sent.at(-1))
    await Promise.all([first, second])
    expect(ready).toHaveBeenCalledTimes(1)
  })
  it('does not announce readiness when the socket closes before acknowledgment', async () => {
    await client.subscribe(['a'], jest.fn())
    const opened = latest().opened()
    latest().dropped()
    await opened
    expect(client.reconnectCount).toBe(0)
    await advance(5000)
    await connect()
    expect(client.reconnectCount).toBe(1)
  })
  it('reconnects after heartbeat timeout with only one retry timer', async () => {
    await connect()
    latest().onSend = undefined
    await advance(15_000)
    expect(latest().readyState).toBe(FakeWebSocket.CLOSED)
    await advance(5000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
  it('backs off repeated failures and caps the delay', async () => {
    latest().failed()
    await advance(5000)
    latest().failed()
    await advance(9999)
    expect(FakeWebSocket.instances).toHaveLength(2)
    await advance(1)
    expect(FakeWebSocket.instances).toHaveLength(3)
    latest().failed()
    await advance(20_000)
    latest().failed()
    await advance(30_000)
    expect(FakeWebSocket.instances).toHaveLength(5)
  })
  it('jitters retries and cancels them on deliberate close', async () => {
    jest.mocked(Math.random).mockReturnValue(0)
    latest().failed()
    await advance(999)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await advance(1)
    expect(FakeWebSocket.instances).toHaveLength(2)
    latest().failed()
    client.close()
    await advance(60_000)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
  it('stops notifying an unsubscribed listener', async () => {
    const listener = jest.fn()
    const unsubscribe = client.onReconnect(listener)
    unsubscribe()
    await connect()
    expect(listener).not.toHaveBeenCalled()
  })
})
