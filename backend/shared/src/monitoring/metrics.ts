import { isEqual, flatten } from 'lodash'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.metricDescriptors#MetricKind
export type MetricKind = 'GAUGE' | 'CUMULATIVE'

// see https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TypedValue
export type MetricValueKind =
  | 'int64Value'
  | 'doubleValue'
  | 'stringValue'
  | 'boolValue'
  | 'distributionValue'

export type MetricDescriptor = {
  metricKind: MetricKind
  valueKind: MetricValueKind
}

export type MetricLabels = Record<string, string>

export const CUSTOM_METRICS = {
  'ws/open_connections': {
    metricKind: 'GAUGE',
    valueKind: 'int64Value',
  },
  'ws/connections_established': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'ws/connections_terminated': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'ws/broadcasts_sent': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'http/request_count': {
    metricKind: 'CUMULATIVE',
    valueKind: 'int64Value',
  },
  'http/request_latency': {
    metricKind: 'GAUGE',
    valueKind: 'distributionValue',
  },
  'pg/transaction_duration': {
    metricKind: 'GAUGE',
    valueKind: 'distributionValue',
  },
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
  'pg/connections_disconnected': {
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

// the typing for all this could be way fancier, but seems overkill

export type CustomMetrics = typeof CUSTOM_METRICS
export type MetricType = keyof CustomMetrics

export type MetricStoreEntry = {
  type: MetricType
  labels?: MetricLabels
  fresh: boolean // whether this metric was touched since last time
  startTime: number // used for cumulative metrics
  points?: number[] // used for distribution metrics
  value: number
}

/** Records metric values by type and labels for later export. */
export class MetricStore {
  // { name: [...entries of that metric with different label values] }
  data: Map<MetricType, MetricStoreEntry[]> = new Map()
  private counters: Map<string, number> = new Map()
  private distributions: Map<string, number[]> = new Map()
  private gauges: Map<string, number> = new Map()
  private cumulativeValues: Map<string, { total: number; startTime: number }> =
    new Map() // Track cumulative totals and start times

  private getInstanceLabels(): MetricLabels {
    return {
      instance_type: process.env.READ_ONLY ? 'read' : 'write',
      port: process.env.PORT ?? 'unknown',
    }
  }

  private getKey(type: MetricType, labels?: MetricLabels) {
    // Combine provided labels with instance labels
    const combinedLabels = { ...this.getInstanceLabels(), ...labels }
    return JSON.stringify({ type, labels: combinedLabels })
  }

  inc(type: MetricType, labels?: MetricLabels) {
    const key = this.getKey(type, labels)
    const current = this.counters.get(key) || 0
    this.counters.set(key, current + 1)

    // For cumulative metrics, maintain the total and start time
    const metric = CUSTOM_METRICS[type as keyof typeof CUSTOM_METRICS]
    if (metric.metricKind === 'CUMULATIVE') {
      const existing = this.cumulativeValues.get(key)
      if (!existing) {
        this.cumulativeValues.set(key, { total: 1, startTime: Date.now() })
      } else {
        this.cumulativeValues.set(key, {
          ...existing,
          total: existing.total + 1,
        })
      }
    }
  }

  push(type: MetricType, val: number, labels?: MetricLabels) {
    const key = this.getKey(type, labels)
    let points = this.distributions.get(key)
    if (!points) {
      points = []
      this.distributions.set(key, points)
    }
    points.push(val)
  }

  set(type: MetricType, val: number, labels?: MetricLabels) {
    const key = this.getKey(type, labels)
    this.gauges.set(key, val)
  }

  clear() {
    this.data.clear()
    this.counters.clear()
    this.distributions.clear()
    this.gauges.clear()
    this.cumulativeValues.clear()
  }

  /** Write accumulated metrics to the underlying store */
  flush() {
    // Write counters (use cumulative values for CUMULATIVE metrics)
    for (const [key, value] of this.counters.entries()) {
      const { type, labels } = JSON.parse(key)
      const metric = CUSTOM_METRICS[type as keyof typeof CUSTOM_METRICS]
      if (metric.metricKind === 'CUMULATIVE') {
        const cumulative = this.cumulativeValues.get(key)
        if (cumulative) {
          const entry = this.getOrCreate(type, labels)
          entry.startTime = cumulative.startTime // Preserve the original start time
          entry.value = cumulative.total
          entry.fresh = true
        }
      } else {
        const entry = this.getOrCreate(type, labels)
        entry.value = value
        entry.fresh = true
      }
    }
    this.counters.clear()

    // Write distributions (as averages)
    for (const [key, points] of this.distributions.entries()) {
      const { type, labels } = JSON.parse(key)
      if (points.length > 0) {
        const entry = this.getOrCreate(type, labels)
        entry.points = points
        entry.fresh = true
      }
    }
    this.distributions.clear()

    // Write latest gauge values
    for (const [key, value] of this.gauges.entries()) {
      const { type, labels } = JSON.parse(key)
      const entry = this.getOrCreate(type, labels)
      entry.value = value
      entry.fresh = true
    }
    this.gauges.clear()
  }

  freshEntries() {
    return flatten(
      Array.from(this.data.entries(), ([_, vs]) => vs.filter((e) => e.fresh))
    )
  }

  // mqp: we could clear all gauges but then we should centralize the process for polling
  // them in order to not have weird gaps.
  clearDistributionGauges() {
    for (const k of this.data.keys()) {
      const { metricKind, valueKind } = CUSTOM_METRICS[k]
      if (metricKind === 'GAUGE' && valueKind === 'distributionValue') {
        this.data.delete(k)
      }
    }
  }

  private getOrCreate(
    type: MetricType,
    labels?: MetricLabels
  ): MetricStoreEntry {
    // Combine provided labels with instance labels
    const combinedLabels = { ...this.getInstanceLabels(), ...labels }

    let entries = this.data.get(type)
    if (entries == null) {
      this.data.set(type, (entries = []))
    }
    for (const entry of entries) {
      if (isEqual(combinedLabels ?? {}, entry.labels ?? {})) {
        return entry
      }
    }
    // none exists, so create it
    const entry: MetricStoreEntry = {
      type,
      labels: combinedLabels,
      startTime: Date.now(),
      fresh: true,
      value: 0,
    }
    entries.push(entry)
    return entry
  }
}

/** The global metric store. */
export const metrics = new MetricStore()
