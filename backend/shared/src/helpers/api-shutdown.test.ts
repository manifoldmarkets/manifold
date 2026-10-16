import * as express from 'express'
import { RequestHandler } from 'express'
import { once } from 'node:events'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { createShutdown, trackRequest } from 'api/helpers/shutdown'
import { authEndpoint, typedEndpoint } from 'api/helpers/endpoint'
import { FullUser } from 'common/api/user-types'
import { ProducerDrain } from './producer-drain'

jest.mock('shared/utils', () => ({
  LOCAL_ONLY: false,
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
const mockVerifyToken = jest.fn()
jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mockVerifyToken }),
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function endpoint(handler: RequestHandler, producers: ProducerDrain) {
  const app = express()
  app.get('/', trackRequest(handler, producers))
  app.use(((error, _req, res, _next) => {
    if (!res.headersSent) res.status(500).end(String(error))
  }) as express.ErrorRequestHandler)
  const server = createServer(app)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
}

function shutdown(producers: ProducerDrain, timeoutMs = 1000) {
  const announce = jest.fn(async () => true)
  const exit = jest.fn()
  const report = jest.fn()
  const stopAcceptingSockets = jest.fn()
  const stop = createShutdown({
    producers,
    announce,
    exit,
    report,
    stopAcceptingSockets,
    timeoutMs,
  })
  return { stop, announce, exit, report, stopAcceptingSockets }
}

it('counts typed authentication and post-response continuation before announcing', async () => {
  const producers = new ProducerDrain()
  const authStarted = deferred()
  const auth = deferred()
  const continuation = deferred()
  const events: string[] = []
  mockVerifyToken.mockImplementation(async () => {
    authStarted.resolve()
    await auth.promise
    return { user_id: 'test-user' }
  })
  const url = await endpoint(
    typedEndpoint('me', async () => ({
      result: { id: 'test-user' } as FullUser,
      continue: async () => {
        await continuation.promise
        events.push('broadcast')
      },
    })),
    producers
  )
  const response = fetch(url, {
    headers: { Authorization: 'Bearer fake-test-token' },
  })
  await authStarted.promise
  const lifecycle = shutdown(producers)
  const stopped = lifecycle.stop()
  expect(lifecycle.stop()).toBe(stopped)
  expect(lifecycle.announce).not.toHaveBeenCalled()
  expect((await fetch(url)).status).toBe(503)
  auth.resolve()
  expect((await response).status).toBe(200)
  expect(producers.pending).toBe(1)
  expect(lifecycle.announce).not.toHaveBeenCalled()
  continuation.resolve()
  await stopped
  expect(events).toEqual(['broadcast'])
  expect(lifecycle.announce).toHaveBeenCalledTimes(1)
  expect(lifecycle.exit).toHaveBeenCalledTimes(1)
  expect(lifecycle.stopAcceptingSockets).toHaveBeenCalledTimes(1)
})

it.each(['legacy', 'webhook'] as const)(
  'keeps %s work tracked after its caller disconnects',
  async (kind) => {
    const producers = new ProducerDrain()
    const entered = deferred()
    const finish = deferred()
    mockVerifyToken.mockResolvedValue({ user_id: 'test-user' })
    const body = async () => {
      entered.resolve()
      await finish.promise
      return { done: true }
    }
    const handler =
      kind === 'legacy'
        ? authEndpoint(body)
        : ((async (_req, res) => {
            const result = await body()
            res.json(result)
          }) as RequestHandler)
    const url = await endpoint(handler, producers)
    const abort = new AbortController()
    const request = fetch(url, {
      signal: abort.signal,
      headers: { Authorization: 'Bearer fake-test-token' },
    }).catch(() => undefined)
    await entered.promise
    abort.abort()
    await request
    const lifecycle = shutdown(producers)
    const stopped = lifecycle.stop()
    expect(lifecycle.announce).not.toHaveBeenCalled()
    finish.resolve()
    await stopped
    expect(lifecycle.announce).toHaveBeenCalledTimes(1)
  }
)

it('exits on the deadline without a trusted marker and ignores repeated stop requests', async () => {
  const producers = new ProducerDrain()
  const finish = deferred()
  const pending = producers.track(() => finish.promise)
  const lifecycle = shutdown(producers, 10)
  const stopped = lifecycle.stop()
  expect(lifecycle.stop()).toBe(stopped)
  await stopped
  expect(lifecycle.announce).not.toHaveBeenCalled()
  expect(lifecycle.report).toHaveBeenCalledWith(false, false)
  expect(lifecycle.exit).toHaveBeenCalledTimes(1)
  finish.resolve()
  await pending
  await lifecycle.stop()
  expect(lifecycle.announce).not.toHaveBeenCalled()
})

it('does not announce success when an accepted post-response continuation fails', async () => {
  const producers = new ProducerDrain()
  const finish = deferred()
  mockVerifyToken.mockResolvedValue({ user_id: 'test-user' })
  const url = await endpoint(
    typedEndpoint('me', async () => ({
      result: { id: 'test-user' } as FullUser,
      continue: async () => {
        await finish.promise
        throw new Error('update failed')
      },
    })),
    producers
  )
  expect(
    (await fetch(url, { headers: { Authorization: 'Bearer fake-test-token' } }))
      .status
  ).toBe(200)
  const lifecycle = shutdown(producers)
  const stopped = lifecycle.stop()
  finish.resolve()
  await stopped
  expect(lifecycle.announce).not.toHaveBeenCalled()
  expect(lifecycle.report).toHaveBeenCalledWith(true, false)
})
