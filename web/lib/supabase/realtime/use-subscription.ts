import { useMemo, useReducer } from 'react'
import { TableName, Row, run } from 'common/supabase/utils'
import {
  Change,
  Filter,
  SubscriptionStatus,
  applyChange,
} from 'common/supabase/realtime'
import { useEvent } from 'web/hooks/use-event'
import { useRealtimeChannel } from 'web/lib/supabase/realtime/use-realtime'
import { db } from 'web/lib/supabase/db'

async function fetchSnapshot<T extends TableName>(
  table: T,
  filter?: Filter<T>
) {
  let q = db.from(table).select('*')
  if (filter != null) {
    q = q.eq(filter.k, filter.v)
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
  pending: Change<T>[]
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T extends TableName> =
  | ActionBase<'ENABLED'>
  | ActionBase<'SUBSCRIBED'>
  | ActionBase<'FETCHED', { snapshot: Row<T>[] }>
  | ActionBase<'RECEIVED_CHANGE', { change: Change<T> }>
  | ActionBase<'RECEIVED_ERROR', { err?: Error }>
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
      case 'RECEIVED_CHANGE': {
        if (state.rows != null) {
          return {
            ...state,
            rows: applyChange(table, state.rows, action.change),
          }
        } else {
          return { ...state, pending: [...state.pending, action.change] }
        }
      }
      case 'RECEIVED_ERROR': {
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
  fetcher?: () => PromiseLike<Row<T>[]>,
  preload?: Row<T>[],
) {
  const fetch = fetcher ?? (() => fetchSnapshot(table, filter))
  const reducer = useMemo(() => getReducer(table), [table])
  const [state, dispatch] = useReducer(reducer, {
    status: 'starting',
    rows: preload,
    pending: []
  })

  const onChange = useEvent((change: Change<T>) => {
    dispatch({ type: 'RECEIVED_CHANGE', change })
  })

  const onStatus = useEvent((status: SubscriptionStatus, err?: Error) => {
    switch (status) {
      case 'SUBSCRIBED': {
        dispatch({ type: 'SUBSCRIBED' })
        fetch().then((snapshot) => {
          dispatch({ type: 'FETCHED', snapshot })
        })
        break
      }
      case 'TIMED_OUT': {
        dispatch({ type: 'RECEIVED_ERROR', err })
        break
      }
      case 'CHANNEL_ERROR': {
        dispatch({ type: 'RECEIVED_ERROR', err })
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

  useRealtimeChannel('*', table, filter, onChange, onStatus, onEnabled)
  return state
}
  return state
}
