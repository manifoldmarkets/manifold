import cluster from 'node:cluster'
import { cpus } from 'node:os'
import { createServer } from 'node:http'
import { listen, localBroadcastMulti } from 'shared/websockets/server'
import { startBridgeSubscriber } from 'shared/websockets/broadcast-bridge'
import { log } from 'shared/utils'

// Dedicated fan-out tier. The primary receives broadcast events from the write
// process over the bridge, coalesces them, and forwards to N worker processes over
// IPC; each worker owns a share of the websocket connections (cluster distributes
// them across the shared port) and does the per-socket sends. This keeps fan-out
// off the write process's event loop and spreads it across cores.

const PORT = Number(process.env.FANOUT_PORT ?? 8080)
const WORKERS = Number(
  process.env.FANOUT_WORKERS ?? Math.max(1, cpus().length - 1)
)
const WINDOW_MS = Number(process.env.BET_BROADCAST_WINDOW_MS ?? 80)
const MAX_PENDING_TOPICS = 50_000

// Coalesce only payloads that can be merged losslessly; anything else is kept as a
// separate payload and sent in order, so no update is ever dropped.
const mergeById = (a: any[], b: any[]) => {
  const m = new Map<unknown, any>()
  for (const x of a) m.set(x.id, x)
  for (const x of b) m.set(x.id, { ...m.get(x.id), ...x })
  return [...m.values()]
}
function tryMerge(a: any, b: any): any | null {
  if (Array.isArray(a.bets) && Array.isArray(b.bets))
    return { ...a, ...b, bets: a.bets.concat(b.bets) }
  if (Array.isArray(a.answers) && Array.isArray(b.answers))
    return { ...a, ...b, answers: mergeById(a.answers, b.answers) }
  if (a.contract && b.contract)
    return { ...a, ...b, contract: { ...a.contract, ...b.contract } }
  if (Array.isArray(a.metrics) && Array.isArray(b.metrics))
    return { ...a, ...b, metrics: a.metrics.concat(b.metrics) }
  return null
}

if (cluster.isPrimary) {
  const workers = Array.from({ length: WORKERS }, () => cluster.fork())
  const send = (topic: string, data: any) => {
    for (const w of workers) if (w.isConnected()) w.send({ topic, data })
  }
  const pending = new Map<string, any[]>()
  let timer: NodeJS.Timeout | undefined
  const flush = () => {
    timer = undefined
    if (pending.size === 0) return
    const entries = [...pending.entries()]
    pending.clear()
    for (const [topic, list] of entries) for (const d of list) send(topic, d)
  }
  startBridgeSubscriber((topics, data) => {
    for (const topic of topics) {
      const list = pending.get(topic)
      if (!list) {
        if (pending.size >= MAX_PENDING_TOPICS) {
          send(topic, data) // over cap: send now rather than grow the map
          continue
        }
        pending.set(topic, [data])
        continue
      }
      const merged = tryMerge(list[list.length - 1], data)
      if (merged) list[list.length - 1] = merged
      else list.push(data)
    }
    if (!timer) timer = setTimeout(flush, WINDOW_MS)
  })
  cluster.on('exit', (worker) => {
    const i = workers.indexOf(worker)
    log.error(`fan-out worker ${worker.process.pid} died; restarting`)
    if (i >= 0) workers[i] = cluster.fork()
  })
  log.info(`fan-out primary forked ${WORKERS} workers`)
} else {
  const httpServer = createServer()
  listen(httpServer, '/ws')
  process.on('message', (msg: { topic: string; data: any }) =>
    localBroadcastMulti([msg.topic], msg.data)
  )
  httpServer.listen(PORT, () => log.info(`fan-out worker on ${PORT}`))
}
