import { APIRealtimeClient } from './websocket-client'
import {
  INITIAL_SPREAD_MS,
  SubscriptionRecovery,
} from './subscription-recovery'

class MockSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockSocket[] = []
  readyState = MockSocket.CONNECTING
  onopen?: () => Promise<void>
  onclose?: (event: { code: number; reason: string }) => void
  onerror?: (event: object) => void
  onmessage?: (event: { data: string }) => void
  messages: { type: string; txid: number; topics?: string[] }[] = []
  constructor(_url: string) {
    MockSocket.instances.push(this)
  }
  send(message: string) {
    this.messages.push(JSON.parse(message))
  }
  open() {
    this.readyState = MockSocket.OPEN
    void this.onopen?.()
  }
  close(code = 1000) {
    if (this.readyState === MockSocket.CLOSED) return
    this.readyState = MockSocket.CLOSED
    this.onclose?.({ code, reason: '' })
  }
  ack(success = true) {
    const message = this.messages[this.messages.length - 1]
    this.onmessage?.({
      data: JSON.stringify({ type: 'ack', txid: message.txid, success }),
    })
  }
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('websocket recovery lifecycle', () => {
  let client: APIRealtimeClient
  let original: typeof WebSocket
  beforeEach(() => {
    jest.useFakeTimers()
    original = global.WebSocket
    global.WebSocket = MockSocket as unknown as typeof WebSocket
    MockSocket.instances = []
    jest.spyOn(console, 'error').mockImplementation(() => {})
    client = new APIRealtimeClient('ws://test')
  })
  afterEach(() => {
    client.close()
    global.WebSocket = original
    jest.restoreAllMocks()
    jest.useRealTimers()
  })
  const firstSocketReady = async () => {
    await client.subscribe(['contract/a', 'contract/b'], jest.fn())
    const socket = MockSocket.instances[0]
    socket.open()
    socket.ack()
    await flush()
    return socket
  }

  it('preserves multi-topic registration and does not recover a healthy socket', async () => {
    const listener = jest.fn()
    client.onConnectionChange(listener)
    const socket = await firstSocketReady()
    expect(socket.messages[0].topics).toEqual(['contract/a', 'contract/b'])
    expect(client.isReady).toBe(true)
    expect(listener).not.toHaveBeenCalledWith(true)
  })

  it('notifies only after successful resubscription ack, once per reconnect', async () => {
    const socket = await firstSocketReady()
    const listener = jest.fn()
    client.onConnectionChange(listener)
    socket.close(1012)
    expect(listener).toHaveBeenCalledWith(false)
    jest.advanceTimersByTime(5000)
    const replacement = MockSocket.instances[1]
    replacement.open()
    await flush()
    expect(listener).not.toHaveBeenCalledWith(true)
    replacement.ack()
    await flush()
    expect(listener.mock.calls.filter(([connected]) => connected)).toHaveLength(
      1
    )
    replacement.close(1012)
    jest.advanceTimersByTime(5000)
    MockSocket.instances[2].open()
    MockSocket.instances[2].ack()
    await flush()
    expect(listener.mock.calls.filter(([connected]) => connected)).toHaveLength(
      2
    )
  })

  it('retries failed resubscription without announcing successful recovery', async () => {
    const socket = await firstSocketReady()
    const listener = jest.fn()
    client.onConnectionChange(listener)
    socket.close(1012)
    jest.advanceTimersByTime(5000)
    const replacement = MockSocket.instances[1]
    replacement.open()
    replacement.ack(false)
    await flush()
    expect(listener).not.toHaveBeenCalledWith(true)
    expect(client.isReady).toBe(false)
    jest.advanceTimersByTime(5000)
    expect(MockSocket.instances).toHaveLength(3)
  })

  it('rejects stale socket messages and close events', async () => {
    const handler = jest.fn()
    await client.subscribe(['contract/a'], handler)
    const old = MockSocket.instances[0]
    old.open()
    old.ack()
    await flush()
    old.close(1012)
    jest.advanceTimersByTime(5000)
    const current = MockSocket.instances[1]
    current.open()
    current.ack()
    await flush()
    old.onmessage?.({
      data: JSON.stringify({
        type: 'broadcast',
        topic: 'contract/a',
        data: {},
      }),
    })
    old.onclose?.({ code: 1012, reason: '' })
    expect(handler).not.toHaveBeenCalled()
    expect(client.isReady).toBe(true)
    expect(client.connectTimeout).toBeUndefined()
  })

  it('waits for topics added during resubscription', async () => {
    const old = await firstSocketReady()
    const listener = jest.fn()
    client.onConnectionChange(listener)
    old.close(1012)
    jest.advanceTimersByTime(5000)
    const socket = MockSocket.instances[1]
    socket.open()
    const pending = client.subscribe(['contract/c'], jest.fn())
    socket.ack()
    await pending
    socket.onmessage?.({
      data: JSON.stringify({
        type: 'ack',
        txid: socket.messages[0].txid,
        success: true,
      }),
    })
    await flush()
    expect(listener).not.toHaveBeenCalledWith(true)
    expect(socket.messages[socket.messages.length - 1].topics).toEqual([
      'contract/a',
      'contract/b',
      'contract/c',
    ])
    socket.ack()
    await flush()
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('does not reconnect after a manual close even if an error is delivered late', async () => {
    const socket = await firstSocketReady()
    client.close()
    socket.onerror?.({})
    jest.advanceTimersByTime(30000)
    expect(MockSocket.instances).toHaveLength(1)
  })

  it('repairs a missed cancellation after reconnect without disturbing a healthy connection', async () => {
    let orders = ['cancelled-order']
    const readOrders = jest.fn(async () => () => {
      orders = []
    })
    const recovery = new SubscriptionRecovery(readOrders, jest.fn())
    const detach = client.onConnectionChange((ready) =>
      recovery.connectionChanged(ready)
    )
    const socket = await firstSocketReady()
    expect(readOrders).not.toHaveBeenCalled()
    // Cancellation committed on the retiring server; its broadcast was lost.
    socket.close(1012)
    jest.advanceTimersByTime(5000)
    const replacement = MockSocket.instances[1]
    replacement.open()
    await flush()
    expect(orders).toEqual(['cancelled-order'])
    expect(readOrders).not.toHaveBeenCalled()
    replacement.ack()
    await flush()
    // Readiness only schedules the read; it is spread across the window so a
    // rollout's reconnects do not all read in the same instant.
    expect(readOrders).not.toHaveBeenCalled()
    jest.advanceTimersByTime(INITIAL_SPREAD_MS)
    await flush()
    expect(orders).toEqual([])
    expect(readOrders).toHaveBeenCalledTimes(1)
    recovery.stop()
    detach()
  })

  it('times out a missing resubscription acknowledgement and retries', async () => {
    const socket = await firstSocketReady()
    const listener = jest.fn()
    client.onConnectionChange(listener)
    socket.close(1012)
    jest.advanceTimersByTime(5000)
    MockSocket.instances[1].open()
    jest.advanceTimersByTime(5000)
    await flush()
    expect(listener).not.toHaveBeenCalledWith(true)
    expect(client.txns.size).toBe(0)
    jest.advanceTimersByTime(5000)
    expect(MockSocket.instances).toHaveLength(3)
  })
})
