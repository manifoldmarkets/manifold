import { act, create, ReactTestRenderer } from 'react-test-renderer'
import type { useApiSubscription as UseApiSubscription } from 'client-common/hooks/use-api-subscription'

jest.mock('common/api/utils', () => ({ getWebsocketUrl: () => 'ws://test' }))

// Drives the real realtime client that useApiSubscription creates on import.
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static latest: FakeWebSocket
  readyState = FakeWebSocket.CONNECTING
  autoAck = true
  sent: { txid: number }[] = []
  onopen: (() => unknown) | null = null
  onclose: ((ev: { code: number; reason: string }) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  constructor() {
    FakeWebSocket.latest = this
  }
  send(data: string) {
    const msg = JSON.parse(data)
    this.sent.push(msg)
    if (this.autoAck) Promise.resolve().then(() => this.ack(msg))
  }
  ack(msg: { txid: number }) {
    this.onmessage?.({ data: JSON.stringify({ type: 'ack', txid: msg.txid }) })
  }
  close(code = 1000) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason: '' })
  }
}
const socket = () => FakeWebSocket.latest
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })

let useApiSubscription: typeof UseApiSubscription
const roots: ReactTestRenderer[] = []

beforeAll(async () => {
  ;(globalThis as any).window = {}
  ;(globalThis as any).WebSocket = FakeWebSocket
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;({ useApiSubscription } = await import(
    'client-common/hooks/use-api-subscription'
  ))
  socket().readyState = FakeWebSocket.OPEN
  await act(async () => {
    await socket().onopen?.()
  })
})
afterEach(async () => {
  socket().autoAck = true
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount()
  })
  await settle()
})
afterAll(() => {
  // A normal close stops the heartbeat without reconnecting.
  socket().close()
  delete (globalThis as any).window
  delete (globalThis as any).WebSocket
})

async function mount(topic: string, onSubscribed: () => void) {
  function Consumer() {
    useApiSubscription({ topics: [topic], onBroadcast: () => {}, onSubscribed })
    return null
  }
  await act(async () => {
    roots.push(create(<Consumer />))
  })
  await settle()
}

it('reconciles after a new subscription but not an acknowledged one', async () => {
  const first = jest.fn(),
    second = jest.fn()
  await mount('contract/a/orders', first)
  expect(first).toHaveBeenCalledTimes(1)
  // Its topic was acknowledged before this consumer's own read began.
  await mount('contract/a/orders', second)
  expect(second).not.toHaveBeenCalled()
})

it('reconciles every consumer that waited for a pending subscription', async () => {
  socket().autoAck = false
  const first = jest.fn(),
    second = jest.fn()
  await mount('contract/b/orders', first)
  await mount('contract/b/orders', second)
  expect(first).not.toHaveBeenCalled()
  await act(async () => socket().ack(socket().sent[socket().sent.length - 1]))
  await settle()
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
})
