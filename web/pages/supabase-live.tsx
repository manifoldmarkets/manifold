import { useMemo, useState } from 'react'
import { bin } from 'd3-array'
import { axisBottom, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { RealtimeChannel } from '@supabase/realtime-js'
import { tsToMillis } from 'common/supabase/utils'
import {
  BindingSpec,
  useRealtime,
} from 'web/lib/supabase/realtime/use-realtime'
import { usePagination } from 'web/hooks/use-pagination'
import { PaginationNextPrev } from 'web/components/widgets/pagination'
import { SizedContainer } from 'web/components/sized-container'
import { XAxis, YAxis } from 'web/components/charts/helpers'
import { Change, Event, SubscriptionStatus } from 'common/supabase/realtime'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { buttonClass } from 'web/components/buttons/button'

const LIVE_TABLES = [
  'contract_bets',
  'contracts',
  'users',
  'contract_comments',
] as const
type LiveTable = (typeof LIVE_TABLES)[number]

type ChangeRecord<T extends LiveTable = LiveTable, E extends Event = Event> = {
  change: Change<T, E>
  firestoreTime?: number
  postgresTime: number
  clientRecvTime: number
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  hour12: false,
  minute: 'numeric',
  second: 'numeric',
  fractionalSecondDigits: 3,
  timeZone: 'America/Los_Angeles',
})

function formatLatency(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`
  } else {
    return `${(ms / 1000).toFixed(1)}s`
  }
}

function postgresLatencyMs(record: ChangeRecord) {
  const { firestoreTime, postgresTime } = record
  return firestoreTime ? postgresTime - firestoreTime : 0
}

function clientLatencyMs(record: ChangeRecord) {
  const { postgresTime, clientRecvTime } = record
  return clientRecvTime - postgresTime
}

function getId<T extends LiveTable>(change: Change<T>) {
  // mqp: typescript too stupid to understand the narrowing here...
  const data = (change.eventType === 'DELETE' ? change.old : change.new) as any
  switch (change.table) {
    case 'contract_bets':
      return data.bet_id
    case 'contract_comments':
      return data.comment_id
    default:
      return data.id
  }
}

function StatusLabel(props: {
  bindings: BindingSpec[]
  chan?: RealtimeChannel
  status?: SubscriptionStatus
  error?: Error
}) {
  const { bindings, chan, status, error } = props
  if (chan == null) {
    return <h1>[dead]</h1>
  }
  return (
    <h1 className="flex flex-row gap-2">
      <span>{chan.topic}</span>
      <span>
        {bindings.map((b) => `${b.table}/${b.event.toLowerCase()}`).join(', ')}
      </span>
      <span>{status ? ` (${status.toLowerCase()})` : ''}</span>
      <span>{error ? ` -- ${error.toString()}` : ''}</span>
    </h1>
  )
}

function ChangeHeader() {
  return (
    <tr className="bg-stone-800">
      <th className="w-28 px-2 text-right">
        T<sub>Firestore</sub>
      </th>
      <th className="w-20 pr-2 text-right">
        T<sub>Postgres</sub>
      </th>
      <th className="w-20 pr-2 text-right">
        T<sub>Client</sub>
      </th>
      <th className="pr-2">Data</th>
    </tr>
  )
}

function ChangeRow<T extends LiveTable, E extends Event>(props: {
  rec: ChangeRecord<T, E>
}) {
  const { rec } = props
  return (
    <tr>
      <td className="w-28 px-2 text-right">
        {rec.firestoreTime ? timeFormatter.format(rec.firestoreTime) : ''}
      </td>
      <td
        className="w-20 pr-2 text-right"
        title={timeFormatter.format(rec.postgresTime)}
      >
        {`+${formatLatency(postgresLatencyMs(rec))}`}
      </td>
      <td
        className="w-20 pr-2 text-right"
        title={timeFormatter.format(rec.clientRecvTime)}
      >{`+${formatLatency(clientLatencyMs(rec))}`}</td>
      <td className="max-w-full pr-2">
        <pre className="whitespace-nowrap3 max-w-full overflow-x-hidden text-ellipsis">
          {rec.change.table} {rec.change.eventType.toLowerCase()}{' '}
          {getId(rec.change)} {JSON.stringify(rec.change.new)}
        </pre>
      </td>
    </tr>
  )
}
export default function SupabaseLivePage() {
  return (
    <Page trackPageView={false}>
      <SEO title="Supabase live test" description="" url="/supabase-live" />
      {LIVE_TABLES.map((t) => (
        <RealtimeLog key={t} bindings={[{ table: t, event: '*' } as const]} />
      ))}
    </Page>
  )
}

function RealtimeLog<T extends LiveTable>(props: {
  bindings: BindingSpec<T, Event>[]
}) {
  const { bindings } = props
  const [enabled, setEnabled] = useState(true)
  const [records, setRecords] = useState<ChangeRecord<T, Event>[]>([])
  const [status, setStatus] = useState<SubscriptionStatus | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const chan = useRealtime({
    bindings,
    enabled,
    onChange: (c) => {
      const firestoreTime =
        'fs_updated_time' in c.new
          ? tsToMillis(c.new.fs_updated_time + 'Z')
          : undefined
      const record = {
        change: c,
        firestoreTime,
        postgresTime: tsToMillis(c.commit_timestamp),
        clientRecvTime: Date.now(),
      }
      setRecords((xs) => [record, ...xs])
    },
    onStatus: (status, err) => {
      setStatus(status)
      setError(err)
    },
  })
  const pagination = usePagination({
    prefix: records,
    q: async () => [],
    pageSize: 10,
  })
  return (
    <div className="text-md flex w-full flex-col">
      <StatusLabel
        bindings={bindings}
        chan={chan.current}
        status={status}
        error={error}
      />
      <table className="w-full table-fixed border-collapse border border-slate-600">
        <thead>
          <ChangeHeader />
        </thead>
        <tbody>
          {pagination.items.map((r, i) => (
            <ChangeRow key={i} rec={r} />
          ))}
        </tbody>
      </table>
      <div className="flex flex-row border-b border-slate-600">
        <SizedContainer className="h-64 basis-1/2 border-x border-slate-600">
          {(w, h) => (
            <Histogram
              w={w}
              h={h}
              barCount={50}
              barPadding={1}
              data={records.map((r) => Math.min(postgresLatencyMs(r), 4999))}
              label="Firestore->Postgres latency (ms)"
            />
          )}
        </SizedContainer>
        <SizedContainer className="h-64 basis-1/2 border-r border-slate-600">
          {(w, h) => (
            <Histogram
              w={w}
              h={h}
              barCount={50}
              barPadding={1}
              data={records.map((r) => Math.min(clientLatencyMs(r), 4999))}
              label="Postgres->client latency (ms)"
            />
          )}
        </SizedContainer>
      </div>
      <div className="my-2 flex flex-row">
        <button
          className={buttonClass('lg', 'gray-outline')}
          onClick={() => {
            setEnabled(!enabled)
          }}
        >
          {enabled ? 'Kill' : 'Resume'}
        </button>
        <PaginationNextPrev {...pagination} />
      </div>
    </div>
  )
}

function Histogram(props: {
  w: number
  h: number
  barCount: number
  barPadding: number
  data: number[]
  label: string
}) {
  const { w, h, barCount, barPadding, data, label } = props
  const margin = { top: 30, right: 40, bottom: 25, left: 10 }

  const innerW = w - margin.right - margin.left
  const innerH = h - margin.top - margin.bottom

  const xScale = useMemo(() => {
    return scaleLinear().domain([0, 5000]).range([10, innerW])
  }, [data, w])

  const buckets = useMemo(() => {
    if (data.length === 0) {
      return []
    }
    const bucketGenerator = bin()
      .value((d) => d)
      .domain(xScale.domain() as [number, number])
      .thresholds(xScale.ticks(barCount))
    return bucketGenerator(data)
  }, [xScale])

  const yScale = useMemo(() => {
    const max = Math.max(...buckets.map((bucket) => bucket?.length))
    return scaleLinear().range([innerH, 0]).domain([0, max]).nice()
  }, [data, h])

  const xAxis = useMemo(() => {
    return axisBottom(xScale)
  }, [xScale])

  const yAxis = useMemo(() => {
    const yTicks = yScale.ticks().filter((tick) => Number.isInteger(tick))
    return axisRight(yScale)
      .tickValues(yTicks)
      .tickFormat((d) => d.valueOf().toFixed(0))
  }, [yScale])

  return (
    <svg width={w} height={h}>
      <g
        width={innerW}
        height={innerH}
        transform={`translate(${[margin.left, margin.top].join(',')})`}
      >
        <text fontSize="smaller" fill="white" x="0" y="-10">
          {label}
        </text>
        <XAxis w={innerW} h={innerH} axis={xAxis} />
        <YAxis w={innerW} axis={yAxis} />
        {buckets.map((bucket, i) => {
          return (
            <rect
              key={i}
              fill="white"
              x={xScale(bucket.x0!) + barPadding / 2}
              width={xScale(bucket.x1!) - xScale(bucket.x0!) - barPadding}
              y={yScale(bucket.length)}
              height={innerH - yScale(bucket.length)}
            />
          )
        })}
      </g>
    </svg>
  )
}
