import * as net from 'node:net'
import * as fs from 'node:fs'
import { z } from 'zod'
import { BroadcastPayload } from 'common/api/websockets'
import { log } from 'shared/utils'

// Bridges broadcasts from the write process to a separate fan-out process so the
// per-socket sends run on a different core. The transport is a Unix-domain socket:
// it's host-local and filesystem-permissioned (owner-only), so there is no network
// surface to spoof. Scaling fan-out across *machines* (not just cores) would swap
// this for a pub/sub broker with its own auth — out of scope here.
//
// Role is set by BROADCAST_BRIDGE: 'publish' (write process -> emit events),
// 'both' (publish AND send locally, for a gap-free migration), or 'local' / unset
// (this process owns the sockets and does the sends).
export const BRIDGE_ROLE = process.env.BROADCAST_BRIDGE ?? 'local'
const BRIDGE_PATH =
  process.env.BROADCAST_BRIDGE_PATH ?? '/tmp/manifold-broadcast.sock'

// Validate every frame before acting on it — a malformed frame is dropped, never
// trusted.
const FrameSchema = z.object({
  topics: z.array(z.string().min(1).max(512)).max(64),
  data: z.record(z.unknown()),
})

const MAX_PENDING = 100_000 // publisher backlog cap while the bridge is down
const MAX_CONN_BUFFER = 16 * 1024 * 1024 // per-connection read buffer cap

// ---- publisher side (write process) ----
let client: net.Socket | undefined
let pending: string[] = []
let dropped = 0

function ensureClient() {
  if (client) return client
  const c = net.createConnection(BRIDGE_PATH)
  c.setNoDelay(true)
  c.on('connect', () => {
    for (const l of pending) c.write(l)
    pending = []
  })
  c.on('error', () => {})
  c.on('close', () => {
    client = undefined
  })
  client = c
  return c
}

export function publishToBridge(topics: string[], data: BroadcastPayload) {
  const line = JSON.stringify({ topics, data }) + '\n'
  const c = ensureClient()
  if (c.connecting || !c.writable) {
    if (pending.length >= MAX_PENDING) {
      pending.shift()
      if (++dropped % 10_000 === 0)
        log.error(`broadcast bridge unreachable; dropped ${dropped} frames`)
    }
    pending.push(line)
  } else {
    c.write(line)
  }
}

// ---- subscriber side (fan-out process) ----
export function startBridgeSubscriber(
  onEvent: (topics: string[], data: BroadcastPayload) => void
) {
  try {
    fs.unlinkSync(BRIDGE_PATH)
  } catch {
    // no stale socket to remove
  }
  const server = net.createServer((sock) => {
    sock.setNoDelay(true)
    let buf = ''
    sock.on('data', (chunk) => {
      buf += chunk
      if (buf.length > MAX_CONN_BUFFER) {
        log.error('broadcast bridge: connection buffer overflow, dropping')
        sock.destroy()
        return
      }
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!line) continue
        let frame
        try {
          frame = FrameSchema.parse(JSON.parse(line))
        } catch (e) {
          log.error('broadcast bridge: invalid frame dropped', { e })
          continue
        }
        try {
          onEvent(frame.topics, frame.data as BroadcastPayload)
        } catch (e) {
          log.error('broadcast bridge: onEvent failed', { e })
        }
      }
    })
    sock.on('error', () => {})
  })
  server.listen(BRIDGE_PATH, () => {
    try {
      fs.chmodSync(BRIDGE_PATH, 0o600) // owner-only
    } catch {
      // best effort
    }
    log.info(`broadcast bridge listening on ${BRIDGE_PATH}`)
  })
  return server
}
