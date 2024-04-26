import { MetricServiceClient } from '@google-cloud/monitoring'
import { log } from 'shared/utils'
import { InstanceInfo, getInstanceInfo } from './instance-info'
import {
  CUSTOM_METRICS,
  MetricStore,
  MetricStoreEntry,
  MetricType,
  metrics,
} from './metrics'

// how often metrics are written. GCP says don't write for a single time series
// more than once per 5 seconds.
export const METRICS_INTERVAL_MS = 5000

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
function serializeValue(type: MetricType, val: number) {
  switch (CUSTOM_METRICS[type].valueKind) {
    case 'int64Value':
      return { int64Value: val }
    default:
      throw new Error('Other value kinds not yet implemented.')
  }
}

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries#Point
function serializePoint(entry: MetricStoreEntry, ts: number) {
  switch (CUSTOM_METRICS[entry.type].metricKind) {
    case 'CUMULATIVE':
      return {
        interval: {
          startTime: { seconds: entry.startTime / 1000 },
          endTime: { seconds: ts / 1000 },
        },
        value: serializeValue(entry.type, entry.value),
      }
    case 'GAUGE': {
      return {
        interval: { endTime: { seconds: ts / 1000 } },
        value: serializeValue(entry.type, entry.value),
      }
    }
    default:
      throw new Error('Other metric kinds not yet implemented.')
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
      labels: entry.labels ?? {},
    },
    points: [serializePoint(entry, ts)],
  }))
}

/** Writes metrics out to GCP's API from a metric store on an interval. */
export class MetricWriter {
  client: MetricServiceClient
  store: MetricStore
  intervalMs: number
  instance?: InstanceInfo
  runInterval?: NodeJS.Timeout

  constructor(store: MetricStore, intervalMs: number) {
    this.client = new MetricServiceClient()
    this.store = store
    this.intervalMs = intervalMs
  }

  async write() {
    const now = Date.now()
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
        // see https://cloud.google.com/monitoring/custom-metrics/creating-metrics
        await this.client.createTimeSeries({
          name: this.client.projectPath(this.instance.projectId),
          timeSeries: serializeEntries(this.instance, freshEntries, now),
        })
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
  }

  stop() {
    clearTimeout(this.runInterval)
  }
}

export const METRIC_WRITER = new MetricWriter(metrics, METRICS_INTERVAL_MS)
