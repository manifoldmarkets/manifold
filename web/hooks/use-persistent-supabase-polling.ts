import { useMemo, useEffect, useRef } from 'react'
import { Row, run, TableName } from 'common/supabase/utils'
import { PostgrestBuilder } from '@supabase/postgrest-js'
import { MINUTE_MS } from 'common/util/time'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { usePersistentLocalState } from './use-persistent-local-state'
import { insertChanges } from 'common/supabase/realtime'

export type DependencyList = readonly unknown[]
export type PollingOptions = {
  ms: number
  deps: DependencyList | undefined
  shouldUseLocalStorage?: boolean
}

type PollingState =
  | { state: 'waiting'; version: number; timeout?: undefined }
  | { state: 'polling'; version: number; timeout: NodeJS.Timeout }
  | { state: 'error'; version: number; timeout?: NodeJS.Timeout }

export function usePersistentSupabasePolling<T extends TableName>(
  table: T,
  allRowsQ: PostgrestBuilder<T>,
  onlyNewRowsQ: (results: Row<T>[] | undefined) => PostgrestBuilder<T>,
  key: string,
  opts?: PollingOptions
) {
  const { ms, deps, shouldUseLocalStorage } = opts ?? {
    ms: MINUTE_MS,
    deps: [],
  }
  const state = useRef<PollingState>({ state: 'waiting', version: 0 })
  const [results, setResults] = (
    shouldUseLocalStorage ? usePersistentLocalState : usePersistentInMemoryState
  )<Row<T>[] | undefined>(undefined, key)

  const runOnlyNewRowsQ = useEvent(async () => {
    const res = await run(onlyNewRowsQ(results))
    return res.data as Row<T>[]
  })
  const runAllRowsQ = useEvent(async () => {
    const res = await run(allRowsQ)
    return res.data as Row<T>[]
  })
  const updateResults = useEvent((rows: Row<T>[]) => {
    setResults(insertChanges(table, results ?? [], rows))
  })

  const fetchNewRows = useMemo(
    () => () => {
      const version = state.current.version
      runOnlyNewRowsQ()
        .then((r) => {
          if (state.current.version == version) {
            updateResults(r)
            state.current = {
              state: 'polling',
              version,
              timeout: setTimeout(fetchNewRows, ms),
            }
          }
        })
        .catch((e) => {
          console.error(e)
          state.current = {
            state: 'error',
            version,
            timeout: setTimeout(fetchNewRows, 1000), // wait a bit longer on error
          }
        })
    },
    [runOnlyNewRowsQ, opts]
  )

  const fetchAllRows = useMemo(
    () => () => {
      const version = state.current.version
      runAllRowsQ()
        .then((r) => {
          if (state.current.version == version) {
            updateResults(r)
            state.current = {
              state: 'polling',
              version,
              timeout: setTimeout(fetchNewRows, ms),
            }
          }
        })
        .catch((e) => {
          console.error(e)
          state.current = {
            state: 'error',
            version,
            timeout: setTimeout(fetchAllRows, 1000), // wait a bit longer on error
          }
        })
    },
    [allRowsQ, opts]
  )

  useEffect(() => {
    // TODO: seems like this should work, but could be error cases where it fails
    if (results === undefined) fetchAllRows()
    else fetchNewRows()
    return () => {
      if (state.current.timeout != null) {
        clearTimeout(state.current.timeout)
      }
      state.current = { state: 'waiting', version: state.current.version + 1 }
    }
  }, deps)

  return results
}
