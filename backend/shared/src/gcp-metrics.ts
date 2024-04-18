import { last } from 'lodash'
import { MetricServiceClient } from '@google-cloud/monitoring'
import * as metadata from 'gcp-metadata'
import { isProd, log } from 'shared/utils'
import { CONFIGS } from 'common/envs/constants'

const CUSTOM_METRICS = {
  'pg/query_count': { valueKind: 'int64Value' },
  'pg/connections_established': { valueKind: 'int64Value' },
  'vercel/revalidations_succeeded': { valueKind: 'int64Value' },
  'vercel/revalidations_failed': { valueKind: 'int64Value' },
} as const

// for value kinds, see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
type MetricValueKinds = {
  int64Value: number
  doubleValue: number
  stringValue: string
  boolValue: boolean
}
type MetricType = keyof typeof CUSTOM_METRICS
type MetricValueKind<T extends MetricType> =
  MetricValueKinds[(typeof CUSTOM_METRICS)[T]['valueKind']]

// reference: https://cloud.google.com/monitoring/custom-metrics/creating-metrics
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

function serializeValue<T extends MetricType>(
  name: T,
  val: MetricValueKind<T>
) {
  switch (CUSTOM_METRICS[name].valueKind) {
    case 'int64Value':
      return { int64Value: val }
    default:
      throw new Error('Other value types not yet implemented.')
  }
}

class MetricsStore {
  valuesByName: Map<MetricType, MetricValueKind<MetricType>>
  constructor() {
    this.valuesByName = new Map()
  }
  clear() {
    this.valuesByName.clear()
  }
  metrics() {
    return Array.from(this.valuesByName.entries())
  }
  set<M extends MetricType>(name: M, val: MetricValueKind<M>) {
    this.valuesByName.set(name, val)
  }
  // mqp: i'm too lazy to figure out how to type this to only numeric metrics atm
  inc<M extends MetricType>(name: M, n?: number) {
    const curr = (this.valuesByName.get(name) ?? 0) as number
    this.valuesByName.set(name, curr + (n ?? 1))
  }
}

class MetricsWriter {
  client: MetricServiceClient
  runInterval?: NodeJS.Timeout

  constructor() {
    this.client = new MetricServiceClient()
  }

  async serialize(instance: InstanceInfo, store: MetricsStore, ts: number) {
    const metricValues = Array.from(store.valuesByName.entries())
    return {
      name: this.client.projectPath(instance.projectId),
      timeSeries: metricValues.map(([name, val]) => ({
        resource: {
          type: 'gce_instance',
          labels: {
            project_id: instance.projectId,
            instance_id: instance.instanceId,
            zone: instance.zone,
          },
        },
        metric: { type: `custom.googleapis.com/${name}` },
        points: [
          {
            interval: { endTime: { seconds: ts / 1000 } },
            value: serializeValue(name, val as MetricValueKind<typeof name>),
          },
        ],
      })),
    }
  }

  async write(instance: InstanceInfo, store: MetricsStore) {
    if (store.metrics().length === 0) {
      log.debug('No metrics to write.')
    } else {
      const now = Date.now()
      const body = await this.serialize(instance, store, now)
      store.clear()
      log.debug('Writing GCP metrics.', { body })
      await this.client.createTimeSeries(body)
    }
  }

  async start(store: MetricsStore, intervalMs: number) {
    if (!this.runInterval) {
      let instance: InstanceInfo | undefined
      this.runInterval = setInterval(async () => {
        try {
          if (!instance) {
            instance = await getInstanceInfo()
            log.debug('Retrieved instance metadata.', { instance })
          }
          await this.write(instance, store)
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
