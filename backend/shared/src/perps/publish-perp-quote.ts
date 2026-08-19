// Push a freshly-applied oracle tick to open perp pages.
//
// Why this indirection exists: broadcasts reach browsers through the
// websocket server, which lives in exactly one process — the API's `serve`
// worker (the `serve-read` cluster sets READ_ONLY and skips webSocketListen).
// Cross-process delivery would normally go through the Redis pub/sub channel
// in websockets/server.ts, but REDIS_URL is empty in prod ("disabled since we
// scaled back down to one instance"), so a broadcast() called here in the
// scheduler would only reach the scheduler's own (empty) switchboard and
// silently die. Instead the scheduler hands the quote to the API over HTTP and
// the API broadcasts it locally, where the sockets actually are.
//
// The POST is intentionally not on the read-replica allowlist in
// url-map-config.yaml, so the load balancer routes it to the writer — the same
// process holding the sockets. Adding this path to that allowlist would break
// delivery silently; don't.

import { getApiUrl } from 'common/api/utils'
import { PerpQuote } from 'common/perps/quote'
import { log, metrics } from 'shared/utils'

// A tick is worthless once the next one lands, so never wait longer than the
// tick interval. Better to drop a push than to let a wedged API back up the
// oracle loop.
const PUSH_TIMEOUT_MS = 2_000

// If the API is unreachable we'd otherwise log once per contract per tick
// (~48 lines/min at a 5s tick across 4 markets). Collapse to one line/minute.
const FAILURE_LOG_INTERVAL_MS = 60_000
let lastFailureLogTime = 0

const logFailureThrottled = (message: string) => {
  const now = Date.now()
  if (now - lastFailureLogTime < FAILURE_LOG_INTERVAL_MS) return
  lastFailureLogTime = now
  log.error(message)
}

/**
 * Fire-and-forget the quote at the API's broadcast endpoint.
 *
 * Never throws and never awaits delivery: the price transition is already
 * committed by the time this is called, and a failed push must not stop the
 * remaining markets on the feed from updating. A dropped push degrades to the
 * client's polling fallback, which is the pre-existing behaviour.
 *
 * Out-of-order arrival is safe — every consumer orders on `oraclePriceTime`
 * via isNewerPerpQuote, not on arrival order.
 */
export const publishPerpQuote = (quote: PerpQuote) => {
  const apiSecret = process.env.API_SECRET
  if (!apiSecret) {
    // Local runs without secrets: polling still keeps the page correct.
    logFailureThrottled(
      '[perp-quote] API_SECRET missing; skipping tick push (clients fall back to polling).'
    )
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)

  void fetch(getApiUrl('internal-perp-broadcast'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiSecret, quote }),
    signal: controller.signal,
  })
    .then((res) => {
      if (res.ok) {
        metrics.inc('perps/quote_pushes_sent')
        return
      }
      metrics.inc('perps/quote_push_failures')
      logFailureThrottled(
        `[perp-quote] push for ${quote.contractId} rejected with HTTP ${res.status}`
      )
    })
    .catch((err: unknown) => {
      metrics.inc('perps/quote_push_failures')
      logFailureThrottled(
        `[perp-quote] push for ${quote.contractId} failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    })
    .finally(() => clearTimeout(timeout))
}
