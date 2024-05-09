import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Assumes append-only */
export function usePersistentSupabasePolling<T extends TableName>(
  table: T,
  allRowsQ: PostgrestBuilder<Row<T>[]>,
  onlyNewRowsQ: (results: Row<T>[] | undefined) => PostgrestBuilder<Row<T>[]>,
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
    return (await run(onlyNewRowsQ(results))).data
  })
  const runAllRowsQ = useEvent(async () => {
    return (await run(allRowsQ)).data
  })
  const updateResults = useEvent((rows: Row<T>[]) => {
    setResults(insertChanges(table, results ?? [], rows))
  })

  const fetchNewRows = useCallback(() => {
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
  }, [runOnlyNewRowsQ, opts])

  const fetchAllRows = useCallback(() => {
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
  }, [allRowsQ, opts])

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

export function useLiveUpdates<T>(
  getRows: () => Promise<T>,
  opts?: {
    frequency?: number
    listen?: boolean
  }
) {
  const { frequency = 500, listen = true } = opts ?? {}

  const state = useRef<PollingState>({ state: 'waiting', version: 0 })

  const [results, setResults] = useState<T | undefined>(undefined)
  const [ms, setMs] = useState(frequency)

  const fetchRows = useCallback(() => {
    const version = state.current.version
    getRows()
      .then((r) => {
        setMs(frequency)
        if (state.current.version == version) {
          setResults(r)
          if (listen) {
            state.current = {
              state: 'polling',
              version,
              timeout: setTimeout(fetchRows, ms),
            }
          }
        }
      })
      .catch((e) => {
        console.error(e)

        // exponential backoff
        setMs((ms) => Math.min(ms ** 1.2, 30_000))

        state.current = {
          state: 'error',
          version,
          timeout: setTimeout(fetchRows, ms),
        }
      })
  }, [listen])

  useEffect(() => {
    if (listen) fetchRows()
    return () => {
      if (state.current.timeout != null) {
        clearTimeout(state.current.timeout)
      }
      state.current = { state: 'waiting', version: state.current.version + 1 }
    }
  }, [listen])

  return results
}
