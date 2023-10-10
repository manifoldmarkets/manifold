import { useRouter } from 'next/dist/client/router'
import { useEffect, useReducer, useState } from 'react'

type UrlParams = Record<string, string | undefined>

// for updating multiple query params
export const usePersistentQueriesState = <T extends UrlParams>(
  defaultValue: T,
  pushState?: boolean
): [T | undefined, (newState: Partial<T>) => void] => {
  const [state, updateState] = usePartialUpdater(defaultValue)
  const [routerHasLoaded, setRouterHasLoaded] = useState(false)

  // On route change on the same page, set the state.
  // On page load, router isn't ready immediately, so set state once it is.

  const router = useRouter()
  useEffect(() => {
    if (!router.isReady) return
    if (router.query && Object.keys(router.query).length > 0) {
      updateState(router.query as Partial<T>)
    } else {
      updateState(defaultValue)
    }
    setRouterHasLoaded(true)
  }, [router.isReady, router.query])

  const setQueryState = (newState: Partial<T>) => {
    updateState(newState)
    const q = { query: { ...router.query, ...newState } }
    if (pushState) {
      router.push(q)
    } else {
      router.replace(q, undefined, {
        shallow: true,
      })
    }
  }

  return [!routerHasLoaded ? undefined : state, setQueryState]
}

export const usePartialUpdater = <T extends UrlParams>(defaultValue: T) => {
  return useReducer(
    (state: T, update: Partial<T>) => ({ ...state, ...update }),
    defaultValue
  )
}

export const usePersistentQueryState = <K extends string>(
  key: K,
  defaultValue: string,
  pushState?: boolean
): [string | undefined, (newState: string) => void] => {
  const [state, updateState] = usePersistentQueriesState(
    {
      [key]: defaultValue,
    },
    pushState
  )
  return [
    state ? state[key] : undefined,
    (newState: string) => updateState({ [key]: newState }),
  ]
}
