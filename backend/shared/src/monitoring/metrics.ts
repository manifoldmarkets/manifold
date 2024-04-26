import { isEqual, flatten } from 'lodash'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.metricDescriptors#MetricKind
export type MetricKind = 'GAUGE' | 'CUMULATIVE'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
export type MetricValueKind =
  | 'int64Value'
  | 'doubleValue'
  | 'stringValue'
  | 'boolValue'

export type MetricDescriptor = {
  metricKind: MetricKind
  valueKind: MetricValueKind
}

export type MetricLabels = Record<string, string>

export const CUSTOM_METRICS = {
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

export type CustomMetrics = typeof CUSTOM_METRICS
export type MetricType = keyof CustomMetrics

// if we want to use string or boolean metrics, we will have to make the store more flexible

export type MetricStoreEntry = {
  type: MetricType
  fresh: boolean // whether this metric was touched since last time
  labels?: MetricLabels
  startTime: number
  value: number
}

export class MetricStore {
  // { name: [...entries of that metric with different label values] }
  data: Map<MetricType, MetricStoreEntry[]>

  constructor() {
    this.data = new Map()
  }

  clear() {
    this.data.clear()
  }

  set(type: MetricType, val: number, labels?: MetricLabels) {
    const entry = this.getOrCreate(type, labels)
    entry.value = val
    entry.fresh = true
  }

  inc(type: MetricType, labels?: MetricLabels) {
    const entry = this.getOrCreate(type, labels)
    entry.value += 1
    entry.fresh = true
  }

  freshEntries() {
    return flatten(
      Array.from(this.data.entries(), ([_, vs]) => vs.filter((e) => e.fresh))
    )
  }

  getOrCreate(type: MetricType, labels?: MetricLabels) {
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

export const metrics = new MetricStore()
