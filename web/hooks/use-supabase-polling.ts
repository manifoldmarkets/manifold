import { useMemo, useEffect, useRef, useState } from 'react'
import { PostgrestBuilder } from '@supabase/postgrest-js'
import { QueryMultiSuccessResponse, run } from 'common/supabase/utils'
import { MINUTE_MS } from 'common/util/time'

export type DependencyList = readonly unknown[]
export type PollingOptions = {
  ms: number
  deps: DependencyList | undefined
}

type PollingState =
  | { state: 'waiting'; version: number; timeout?: undefined }
  | { state: 'polling'; version: number; timeout: NodeJS.Timeout }
  | { state: 'error'; version: number; timeout?: NodeJS.Timeout }

export function useSupabasePolling<T>(
  q: PostgrestBuilder<T>,
  opts?: PollingOptions
) {
  const { ms, deps } = opts ?? { ms: MINUTE_MS, deps: [] }
  const state = useRef<PollingState>({ state: 'waiting', version: 0 })
  const [results, setResults] = useState<
    QueryMultiSuccessResponse<T> | undefined
  >()

  const updateResults = useMemo(
    () => () => {
      const version = state.current.version
      run(q)
        .then((r) => {
          if (state.current.version == version) {
            setResults(r)
            state.current = {
              state: 'polling',
              version,
              timeout: setTimeout(updateResults, ms),
            }
          }
        })
        .catch((e) => {
          console.error(e)
          state.current = {
            state: 'error',
            version,
            timeout: setTimeout(updateResults, 1000), // wait a bit longer on error
          }
        })
    },
    [q, opts]
  )

  useEffect(() => {
    setResults(undefined) // if we changed the deps, we have no results
    updateResults()
    return () => {
      if (state.current.timeout != null) {
        clearTimeout(state.current.timeout)
      }
      state.current = { state: 'waiting', version: state.current.version + 1 }
    }
  }, deps)

  return results
}
