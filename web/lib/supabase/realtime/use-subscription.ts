import { useEffect, useMemo, useReducer } from 'react'
import { TableName, Row, run } from 'common/supabase/utils'
import {
  ChangedRow,
  Filter,
  SubscriptionStatus,
  applyChange,
} from 'common/supabase/realtime'
import { useEvent } from 'web/hooks/use-event'
import { useIsClient } from 'web/hooks/use-is-client'
import { useRealtime } from 'web/lib/supabase/realtime/use-realtime'
import { Store } from 'web/lib/util/local'
import { db } from 'web/lib/supabase/db'

async function fetchSnapshot<T extends TableName>(
  table: T,
  filter?: Filter<T>
) {
  const q = db.from(table).select('*')
  if (filter != null) {
    if (filter.op == undefined || filter.op === 'eq') {
      q.eq(filter.k, filter.v)
    } else if (filter.op === 'in') {
      q.in(filter.k, filter.v)
    } else {
      q[filter.op](filter.k, filter.v)
    }
  }
  return (await run(q)).data as Row<T>[]
}

// subscription lifecycle:
// 1. starting: when we are awaiting our channel to connect
// 2. fetching: when we are connected and awaiting an initial snapshot
// 3. live: normal operation, we are up to date with postgres
// 4. errored: when the channel is dead/degraded due to an error
// 5. disabled: when the channel is dead due to being backgrounded/unmounted

export interface State<T extends TableName> {
  status: 'starting' | 'fetching' | 'live' | 'errored' | 'disabled'
  rows?: Row<T>[]
  pending: ChangedRow<Row<T>>[]
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T extends TableName> =
  | ActionBase<'ENABLED'>
  | ActionBase<'SUBSCRIBED'>
  | ActionBase<'FETCHED', { snapshot: Row<T>[] }>
  | ActionBase<'CHANGE', { change: ChangedRow<Row<T>> }>
  | ActionBase<'ERROR', { err?: Error }>
  | ActionBase<'DISABLED'>

const getReducer =
  <T extends TableName>(table: T) =>
  (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'ENABLED': {
        return { ...state, status: 'starting', pending: [] }
      }
      case 'SUBSCRIBED': {
        return { ...state, status: 'fetching', pending: [] }
      }
      case 'FETCHED': {
        let rows = action.snapshot
        for (const change of state.pending) {
          rows = applyChange(table, rows, change)
        }
        return { status: 'live', rows: rows, pending: [] }
      }
      case 'CHANGE': {
        if (state.rows != null) {
          return {
            ...state,
            rows: applyChange(table, state.rows, action.change),
          }
        } else {
          return { ...state, pending: [...state.pending, action.change] }
        }
      }
      case 'ERROR': {
        return { ...state, status: 'errored' }
      }
      case 'DISABLED': {
        return { ...state, status: 'disabled' }
      }
      default:
        throw new Error('Invalid action.')
    }
  }

export function useSubscription<T extends TableName>(
  table: T,
  filter?: Filter<T>,
  fetcher?: () => PromiseLike<Row<T>[] | undefined>,
  preload?: Row<T>[]
) {
  const fetch = fetcher ?? (() => fetchSnapshot(table, filter))
  const reducer = useMemo(() => getReducer(table), [table])
  const [state, dispatch] = useReducer(reducer, {
    status: 'starting',
    rows: preload,
    pending: [],
  })

  const onChange = useEvent((change: ChangedRow<Row<T>>) => {
    dispatch({ type: 'CHANGE', change })
  })

  const onStatus = useEvent((status: SubscriptionStatus, err?: Error) => {
    switch (status) {
      case 'SUBSCRIBED': {
        dispatch({ type: 'SUBSCRIBED' })
        fetch().then((snapshot) => {
          if (snapshot != undefined) dispatch({ type: 'FETCHED', snapshot })
        })
        break
      }
      case 'TIMED_OUT': {
        dispatch({ type: 'ERROR', err })
        break
      }
      case 'CHANNEL_ERROR': {
        dispatch({ type: 'ERROR', err })
        break
      }
      case 'CLOSED': {
        // nothing to do here
      }
    }
  })

  const onEnabled = useEvent((enabled: boolean) => {
    dispatch({ type: enabled ? 'ENABLED' : 'DISABLED' })
  })

  const bindings = [{ event: '*', table, filter } as const]
  useRealtime({ bindings, onChange, onStatus, onEnabled })
  return { ...state, dispatch }
}

export function usePersistentSubscription<T extends TableName>(
  key: string,
  table: T,
  store?: Store,
  filter?: Filter<T>,
  fetcher?: () => PromiseLike<Row<T>[] | undefined>
) {
  const isClient = useIsClient()
  const json = isClient ? store?.getItem(key) : undefined
  const rows = json != null ? (JSON.parse(json) as Row<T>[]) : undefined
  const state = useSubscription(table, filter, fetcher, rows)

  useEffect(() => {
    if (state.status === 'live') {
      store?.setItem(key, JSON.stringify(state.rows ?? null))
    }
  }, [state.status, state.rows])

  return state
}
