import { useMemo, useEffect, useRef } from 'react'
import { PostgrestBuilder } from '@supabase/postgrest-js'
import { QueryMultiSuccessResponse, run } from 'common/supabase/utils'
import { MINUTE_MS } from 'common/util/time'
import { useEvent } from 'web/hooks/use-event'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export type DependencyList = readonly unknown[]
export type PollingOptions = {
  ms: number
  deps: DependencyList | undefined
}

type PollingState =
  | { state: 'waiting'; version: number; timeout?: undefined }
  | { state: 'polling'; version: number; timeout: NodeJS.Timeout }
  | { state: 'error'; version: number; timeout?: NodeJS.Timeout }

export function usePersistentSupabasePolling<T>(
  allRowsQ: PostgrestBuilder<T>,
  onlyNewRowsQ: (results: T[] | undefined) => PostgrestBuilder<T>,
  key: string,
  opts?: PollingOptions
) {
  const { ms, deps } = opts ?? { ms: MINUTE_MS, deps: [] }
  const state = useRef<PollingState>({ state: 'waiting', version: 0 })
  const [results, setResults] = usePersistentLocalState<
    QueryMultiSuccessResponse<T> | undefined
  >(undefined, key)

  const onlyNewRowsQBy = useEvent(async () => onlyNewRowsQ(results?.data))

  const fetchNewRows = useMemo(
    () => () => {
      const version = state.current.version
      run(onlyNewRowsQBy())
        .then((r) => {
          if (state.current.version == version) {
            setResults((prev) => ({
              data: [...(prev?.data ?? []), ...(r.data ?? [])],
              count: (prev?.count ?? 0) + (r?.count ?? 0),
            }))
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
    [onlyNewRowsQBy, opts]
  )

  const fetchAllRows = useMemo(
    () => () => {
      const version = state.current.version
      run(allRowsQ)
        .then((r) => {
          if (state.current.version == version) {
            setResults(r)
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
