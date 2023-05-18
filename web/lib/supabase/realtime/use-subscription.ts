import { useMemo, useReducer } from 'react'
import { TableName, Row, run } from 'common/supabase/utils'
import {
  Change,
  Filter,
  SubscriptionStatus,
  applyChange
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
// 1. subscribing -- when we are awaiting our channel to connect
// 2. fetching -- when we are connected and awaiting an initial snapshot
// 3. live -- normal operation, we are up to date with postgres
// 4. errored -- when the subscription is dead due to an error

interface State<T extends TableName> {
  status: 'subscribing' | 'fetching' | 'live' | 'errored'
  rows?: Row<T>[]
  pending: Change<T>[]
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T extends TableName> =
  | ActionBase<'SUBSCRIBED'>
  | ActionBase<'FETCHED', { snapshot: Row<T>[] }>
  | ActionBase<'RECEIVED_CHANGE', { change: Change<T> }>
  | ActionBase<'RECEIVED_ERROR', { err?: Error }>
  | ActionBase<'BACKGROUNDED'>
  | ActionBase<'RESTARTED'>

const getReducer =
  <T extends TableName>(table: T) =>
  (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'RESTARTED': {
        return { ...state, status: 'subscribing', pending: [] }
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
      default:
        throw new Error('Invalid action.')
    }
  }

export function useSubscription<T extends TableName>(
  table: T,
  filter?: Filter<T>
) {
  const initialState = { status: 'subscribing', pending: [] } as State<T>
  const reducer = useMemo(() => getReducer(table), [table])
  const [state, dispatch] = useReducer(reducer, initialState)

  const onChange = useEvent((change: Change<T>) => {
    dispatch({ type: 'RECEIVED_CHANGE', change })
  })

  const onStatus = useEvent((status: SubscriptionStatus, err?: Error) => {
    switch (status) {
      case 'SUBSCRIBED': {
        dispatch({ type: 'SUBSCRIBED' })
        fetchSnapshot(table, filter).then((snapshot) => {
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

  useRealtimeChannel('*', table, filter, onChange, onStatus)
  return state
}
