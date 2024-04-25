import { isEqual, last } from 'lodash'
import { MetricServiceClient } from '@google-cloud/monitoring'
import * as metadata from 'gcp-metadata'
import { log } from 'shared/utils'

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.metricDescriptors#MetricKind
type MetricKind = 'GAUGE' | 'CUMULATIVE' | 'DELTA'
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

function serializeValue<T extends MetricType>(name: T, val: number) {
  switch (CUSTOM_METRICS[name].valueKind) {
    case 'int64Value':
      return { int64Value: val }
    default:
      throw new Error('Other value types not yet implemented.')
  }
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
  // depending on how many labels we make we might want to use a real data structure here
  data: MetricStoreEntry[]

  constructor() {
    this.data = []
  }
  clear() {
    this.data.length = 0
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
  getOrCreate(type: MetricType, labels?: Record<string, string>) {
    for (const entry of this.data) {
      if (entry.type == type) {
        if (isEqual(labels ?? {}, entry.labels ?? {})) {
          return entry
        }
      }
    }
    // none exists, so create it
    const entry = { type, labels, startTime: Date.now(), fresh: true, value: 0 }
    this.data.push(entry)
    return entry
  }
}

class MetricsWriter {
  client: MetricServiceClient
  instance?: InstanceInfo
  runInterval?: NodeJS.Timeout

  constructor() {
    this.client = new MetricServiceClient()
  }

  serialize(instance: InstanceInfo, entries: MetricStoreEntry[], ts: number) {
    return {
      name: this.client.projectPath(instance.projectId),
      timeSeries: entries.map((entry) => ({
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
        points: [
          {
            // if we support non-cumulative metrics this might need to be changed
            interval: {
              startTime: { seconds: entry.startTime / 1000 },
              endTime: { seconds: ts / 1000 },
            },
            value: serializeValue(entry.type, entry.value),
          },
        ],
      })),
    }
  }

  async write(store: MetricsStore) {
    const now = Date.now()
    const freshEntries = store.data.filter((e) => e.fresh)
    if (freshEntries.length > 0) {
      log.debug('Writing GCP metrics.', { entries: freshEntries })
      if (!LOCAL_DEV) {
        if (this.instance == null) {
          this.instance = await getInstanceInfo()
          log.debug('Retrieved instance metadata.', {
            instance: this.instance,
          })
        }
        // if we start using gauge or delta metrics, we will need to reset them here
        for (const entry of freshEntries) {
          entry.fresh = false
        }
        const body = this.serialize(this.instance, freshEntries, now)
        await this.client.createTimeSeries(body)
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
  writer.start(metrics, 5000)
  return writer
}

startWriter()
