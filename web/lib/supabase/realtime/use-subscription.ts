import { useEffect, useId, useMemo, useReducer, useRef } from 'react'
import { RealtimeChannel } from '@supabase/realtime-js'
import { TableName, Row, run } from 'common/supabase/utils'
import {
  Change,
  Filter,
  SubscriptionStatus,
  applyChange,
  buildFilterString
} from 'common/supabase/realtime'
import { useEvent } from 'web/hooks/use-event'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
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
  status: 'subscribing' | 'fetching' | 'live' | 'errored',
  rows?: Row<T>[],
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
          return { ...state, rows: applyChange(table, state.rows, action.change) }
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
  filter?: Filter<T>,
  preload?: Row<T>[]
) {
  const initialState = { status: 'subscribing', rows: preload, pending: [] } as State<T>
  const filterString = filter ? buildFilterString(filter) : undefined
  const channelId = `${table}-${useId()}`
  const channel = useRef<RealtimeChannel | undefined>()
  const reducer = useMemo(() => getReducer(table), [table])
  const [state, dispatch] = useReducer(reducer, initialState)
  const isVisible = useIsPageVisible()

  const onChange = useEvent((change: Change<T>) => {
    dispatch({ type: 'RECEIVED_CHANGE', change })
  })

  const onStatus = useEvent((status: SubscriptionStatus, err?: Error) => {
    console.log(status, err)
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

  // WIP - test and figure out most appropriate stuff to do on
  // socket close, socket error, channel error, channel timeout

  const onSocketClose = useEvent((ev: CloseEvent) => {
    console.log("onClose: ", ev)
  })

  const onSocketError = useEvent((ev: ErrorEvent) => {
    console.log("onError: ", ev)
  })

  useEffect(() => {
    if (isVisible) {
      const opts = { event: '*', schema: 'public', table, filter: filterString } as const
      const chan = channel.current = db.channel(channelId)
      chan.on<Row<T>>('postgres_changes', opts, (change) => {
        // if we got this change over a channel we have recycled, ignore it
        if (channel.current === chan) {
          onChange?.(change)
        }
      }).subscribe((status, err) => {
        onStatus?.(status, err)
      })
      return () => {
        db.removeChannel(chan)
        channel.current = undefined
      }
    }
  }, [table, filterString, isVisible, onChange, onStatus])

  useEffect(() => {
    const cbs = db['realtime'].stateChangeCallbacks
    const closeIdx = cbs.close.push(onSocketClose) - 1
    const errorIdx = cbs.error.push(onSocketError) - 1
    return () => {
      cbs.close.splice(closeIdx, 1)
      cbs.error.splice(errorIdx, 1)
    }
  }, [])

  return state.rows
}
