import { isEqual, flatten, last } from 'lodash'
import { MetricServiceClient } from '@google-cloud/monitoring'
import * as metadata from 'gcp-metadata'
import { log } from 'shared/utils'

// how often metrics are written. GCP says don't write for a single time series
// more than once per 5 seconds.
export const METRICS_INTERVAL_MS = 5000

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.metricDescriptors#MetricKind
type MetricKind = 'GAUGE' | 'CUMULATIVE'
// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
type MetricValueKind =
  | 'int64Value'
  | 'doubleValue'
  | 'stringValue'
  | 'boolValue'
type MetricDescriptor = { metricKind: MetricKind; valueKind: MetricValueKind }

const CUSTOM_METRICS = {
  'app/bet_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'app/contract_view_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/query_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_established': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_terminated': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_acquired': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/connections_released': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'pg/pool_connections': {
    metricKind: 'GAUGE',
    valueKind: 'int64Value',
  },
  'vercel/revalidations_succeeded': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'vercel/revalidations_failed': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
} as const satisfies { [k: string]: MetricDescriptor }

type CustomMetrics = typeof CUSTOM_METRICS
type MetricType = keyof CustomMetrics

// see https://cloud.google.com/monitoring/custom-metrics/creating-metrics
type InstanceInfo = {
  projectId: string
  instanceId: string
  zone: string
}

async function getInstanceInfo() {
  const [projectId, instanceId, fqZone] = await Promise.all([
    metadata.project('project-id'),
    metadata.instance('id'),
    metadata.instance('zone'),
  ])
  // GCP returns zone as `projects/${id}/zones/${zone}
  const zone = last(fqZone.split('/'))
  return { projectId, instanceId, zone } as InstanceInfo
}

// if we want to use string or boolean metrics, we will have to make this code more flexible

type MetricStoreEntry = {
  type: MetricType
  fresh: boolean // whether this metric was touched since last time
  labels?: Record<string, string>
  startTime: number
  value: number
}

class MetricsStore {
  // { name: [...entries of that metric with different label values] }
  data: Map<MetricType, MetricStoreEntry[]>

  constructor() {
    this.data = new Map()
  }
  clear() {
    this.data.clear()
  }
  set(type: MetricType, val: number, labels?: Record<string, string>) {
    const entry = this.getOrCreate(type, labels)
    entry.value = val
    entry.fresh = true
  }
  inc(type: MetricType, labels?: Record<string, string>) {
    const entry = this.getOrCreate(type, labels)
    entry.value += 1
    entry.fresh = true
  }
  freshEntries() {
    return flatten(
      Array.from(this.data.entries(), ([_, vs]) => vs.filter((e) => e.fresh))
    )
  }
  getOrCreate(type: MetricType, labels?: Record<string, string>) {
    let entries = this.data.get(type)
    if (entries == null) {
      this.data.set(type, (entries = []))
    }
    for (const entry of entries) {
      if (isEqual(labels ?? {}, entry.labels ?? {})) {
        return entry
      }
    }
    // none exists, so create it
    const entry = { type, labels, startTime: Date.now(), fresh: true, value: 0 }
    entries.push(entry)
    return entry
  }
}

function serializeValue<T extends MetricType>(type: T, val: number) {
  switch (CUSTOM_METRICS[type].valueKind) {
    case 'int64Value':
      return { int64Value: val }
    default:
      throw new Error('Other value kinds not yet implemented.')
  }
}

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

class MetricsWriter {
  client: MetricServiceClient
  instance?: InstanceInfo
  runInterval?: NodeJS.Timeout

  constructor() {
    this.client = new MetricServiceClient()
  }

  async write(store: MetricsStore) {
    const now = Date.now()
    const freshEntries = store.freshEntries()
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
        await this.client.createTimeSeries({
          name: this.client.projectPath(this.instance.projectId),
          timeSeries: serializeEntries(this.instance, freshEntries, now),
        })
      }
    }
  }

  async start(store: MetricsStore, intervalMs: number) {
    if (!this.runInterval) {
      this.runInterval = setInterval(async () => {
        try {
          await this.write(store)
        } catch (error) {
          log.error('Failed to write metrics.', { error })
        }
      }, intervalMs)
    }
  }

  async stop() {
    clearTimeout(this.runInterval)
  }
}

export const metrics = new MetricsStore()

export function startWriter() {
  const writer = new MetricsWriter()
  writer.start(metrics, METRICS_INTERVAL_MS)
  return writer
}

startWriter()
