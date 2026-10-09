import { MetricServiceClient } from '@google-cloud/monitoring'
import { average, sumOfSquaredError } from 'common/util/math'
import { LOCAL_DEV, log } from 'shared/utils'
import { InstanceInfo, getInstanceInfo } from './instance-info'
import { chunk } from 'lodash'
import {
  CUSTOM_METRICS,
  MetricStore,
  MetricStoreEntry,
  metrics,
} from './metrics'

// how often metrics are written. GCP says don't write for a single time series
// more than once per 5 seconds.
export const METRICS_INTERVAL_MS = 60_000

// How often the event-loop lag sampler is meant to run. A sample that fires
// late by more than the interval was held up by synchronous work (or GC); the
// worst such lag between flushes is exported as process/event_loop_lag_ms.
const LAG_SAMPLE_MS = 1_000
// A single stall this long is logged on its own, so it lands in Logs Explorer
// next to the job that caused it. The pool's idle_in_transaction_session_timeout
// is 60 s, so anything approaching that is already costing other jobs.
const STALL_WARN_MS = 5_000

function serializeTimestamp(ts: number) {
  const seconds = ts / 1000
  const nanos = (ts % 1000) * 1000
  return { seconds, nanos } as const
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.snoozes#timeinterval
function serializeInterval(entry: MetricStoreEntry, ts: number) {
  switch (CUSTOM_METRICS[entry.type].metricKind) {
    case 'CUMULATIVE':
      return {
        startTime: serializeTimestamp(entry.startTime),
        endTime: serializeTimestamp(ts),
      }
    case 'GAUGE': {
      return { endTime: serializeTimestamp(ts) }
    }
  }
}

function serializeDistribution(points: number[]) {
  // see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue#distribution
  return {
    count: points.length,
    mean: average(points),
    sumOfSquaredDeviation: sumOfSquaredError(points),
    // not interested in handling histograms right now
    bucketOptions: { explicitBuckets: { bounds: [0] } },
    bucketCounts: [0, points.length],
  }
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
function serializeValue(entry: MetricStoreEntry) {
  switch (CUSTOM_METRICS[entry.type].valueKind) {
    case 'int64Value':
      return { int64Value: entry.value }
    case 'distributionValue': {
      return { distributionValue: serializeDistribution(entry.points ?? []) }
    }
    default:
      throw new Error('Other value kinds not yet implemented.')
  }
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries
function serializeEntries(
  instance: InstanceInfo,
  entries: MetricStoreEntry[],
  ts: number
) {
  return entries.map((entry) => ({
    metricKind: CUSTOM_METRICS[entry.type].metricKind,
    resource: {
      type: 'gce_instance',
      labels: {
        project_id: instance.projectId,
        instance_id: instance.instanceId,
        zone: instance.zone,
      },
    },
    metric: {
      type: `custom.googleapis.com/${entry.type}`,
      labels: {
        ...(entry.labels ?? {}),
        instance_type: process.env.READ_ONLY ? 'read' : 'write',
        port: process.env.PORT ?? 'unknown',
      },
    },
    points: [
      {
        interval: serializeInterval(entry, ts),
        value: serializeValue(entry),
      },
    ],
  }))
}

/** Writes metrics out to GCP's API from a metric store on an interval. */
export class MetricWriter {
  client: MetricServiceClient
  store: MetricStore
  intervalMs: number
  instance?: InstanceInfo
  runInterval?: NodeJS.Timeout
  lagInterval?: NodeJS.Timeout
  maxLagMs = 0

  constructor(store: MetricStore, intervalMs: number) {
    this.client = new MetricServiceClient()
    this.store = store
    this.intervalMs = intervalMs
  }

  // Memory and worst event-loop lag since the last flush, as gauges on
  // every flush. process.memoryUsage() is cheap; heapUsed is the number that
  // hits --max-old-space-size.
  sampleProcessHealth() {
    const mem = process.memoryUsage()
    this.store.set('process/rss_bytes', mem.rss)
    this.store.set('process/heap_used_bytes', mem.heapUsed)
    this.store.set('process/heap_total_bytes', mem.heapTotal)
    this.store.set('process/event_loop_lag_ms', Math.round(this.maxLagMs))
    this.maxLagMs = 0
  }

  async write() {
    this.sampleProcessHealth()
    const freshEntries = this.store.freshEntries()
    if (freshEntries.length > 0) {
      for (const entry of freshEntries) {
        entry.fresh = false
      }
      if (!LOCAL_DEV) {
        log.debug('Writing GCP metrics.', { entries: freshEntries })
        if (this.instance == null) {
          this.instance = await getInstanceInfo()
          log.debug('Retrieved instance metadata.', {
            instance: this.instance,
          })
        }
        // mqp: bump now by 1ms to avoid it being === to just written entry times
        const now = Date.now() + 1
        const name = this.client.projectPath(this.instance.projectId)
        const timeSeries = serializeEntries(this.instance, freshEntries, now)
        // GCP imposes a max 200 per call limit
        for (const batch of chunk(timeSeries, 200)) {
          this.store.clearDistributionGauges()
          // see https://cloud.google.com/monitoring/custom-metrics/creating-metrics
          await this.client.createTimeSeries({ timeSeries: batch, name })
        }
      }
    }
  }

  start() {
    if (!this.runInterval) {
      this.runInterval = setInterval(async () => {
        try {
          await this.write()
        } catch (error) {
          log.error('Failed to write metrics.', { error })
        }
      }, this.intervalMs)
    }
    if (!this.lagInterval) {
      // Timer drift as the lag measure: a callback due at `expected` that
      // runs at `now` was blocked for now - expected. After a long stall Node
      // fires an overdue interval once, so one sample sees the whole stall.
      let expected = Date.now() + LAG_SAMPLE_MS
      this.lagInterval = setInterval(() => {
        const now = Date.now()
        const lag = Math.max(0, now - expected)
        expected = now + LAG_SAMPLE_MS
        if (lag > this.maxLagMs) this.maxLagMs = lag
        if (lag >= STALL_WARN_MS) {
          log.warn(`Event loop stalled for ${(lag / 1000).toFixed(1)}s.`, {
            lagMs: lag,
          })
        }
      }, LAG_SAMPLE_MS)
      // Never keep the process alive just to measure it.
      this.lagInterval.unref()
    }
  }

  stop() {
    clearTimeout(this.runInterval)
    clearInterval(this.lagInterval)
    this.runInterval = undefined
    this.lagInterval = undefined
  }
}

export const METRIC_WRITER = new MetricWriter(metrics, METRICS_INTERVAL_MS)
