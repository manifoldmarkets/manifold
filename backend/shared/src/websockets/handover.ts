import { request } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { log } from 'shared/utils'

// Instance metadata written by backend/api/deploy-rollout.cjs (HANDOVER_KEY)
// once the VM a deploy retired is gone. Keep the two names in sync.
export const HANDOVER_KEY = 'api-websocket-handover'

const metadataHost = () =>
  process.env.GCE_METADATA_HOST || 'metadata.google.internal'

function getMetadata(
  path: string,
  {
    host = metadataHost(),
    timeoutMs = 5_000,
    signal = undefined as AbortSignal | undefined,
  } = {}
) {
  return new Promise<{ etag?: string; body: string }>((resolve, reject) => {
    const req = request(
      `http://${host}/computeMetadata/v1/${path}`,
      { headers: { 'Metadata-Flavor': 'Google' }, signal, timeout: timeoutMs },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (body += chunk))
        res.on('error', reject)
        res.on('end', () => {
          if (res.statusCode === 200) resolve({ etag: res.headers.etag, body })
          else reject(new Error(`Metadata server returned ${res.statusCode}`))
        })
      }
    )
    req.on('timeout', () =>
      req.destroy(new Error('Metadata request timed out'))
    )
    req.on('error', reject)
    req.end()
  })
}

/** This VM's instance name, which a deploy's handover value refers to. */
export async function readInstanceName(options: { host?: string } = {}) {
  const { body } = await getMetadata('instance/name', options)
  return body.trim()
}

/**
 * Calls onHandover with each new value a deploy writes to this VM's
 * HANDOVER_KEY attribute. The value present when watching starts is the
 * baseline, not a handover. Returns a function that stops watching.
 */
export function watchHandover(
  onHandover: (value: string) => void,
  { host = metadataHost(), timeoutSec = 300, retryDelayMs = 1_000 } = {}
) {
  const controller = new AbortController()
  const watch = async () => {
    let etag: string | undefined
    let current: string | undefined
    let failures = 0
    while (!controller.signal.aborted) {
      try {
        // With last_etag the server answers as soon as anything differs from
        // that version, so no change between two reads can be missed.
        const query =
          etag == null
            ? ''
            : `&wait_for_change=true&last_etag=${encodeURIComponent(
                etag
              )}&timeout_sec=${timeoutSec}`
        const response = await getMetadata(
          `instance/attributes/?recursive=true${query}`,
          {
            host,
            timeoutMs: (timeoutSec + 30) * 1000,
            signal: controller.signal,
          }
        )
        if (!response.etag) throw new Error('Metadata server sent no ETag')
        const value = JSON.parse(response.body)[HANDOVER_KEY]
        const next = typeof value === 'string' && value ? value : undefined
        if (etag != null && next != null && next !== current) {
          try {
            onHandover(next)
          } catch (error) {
            log.error('WebSocket handover failed.', { error, handover: next })
          }
        }
        current = next
        etag = response.etag
        failures = 0
      } catch (error) {
        if (controller.signal.aborted) return
        failures++
        if (failures === 1 || failures % 30 === 0) {
          log.warn('Cannot read instance metadata for WebSocket handovers.', {
            error,
            failures,
          })
        }
        const delayMs = Math.min(retryDelayMs * 2 ** (failures - 1), 60_000)
        await sleep(delayMs, undefined, { signal: controller.signal }).catch(
          () => {}
        )
      }
    }
  }
  void watch()
  return () => controller.abort()
}
