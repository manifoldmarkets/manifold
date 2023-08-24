import { useRouter } from 'next/dist/client/router'
import { useEffect, useReducer } from 'react'

type UrlParams = Record<string, string | undefined>

// note this does not set state if route changes via other source (e.g. link click). you need to use the setter returned here.
// typically used for search params
export const usePersistentQueryState = <T extends UrlParams>(
  defaultValue: T
): [T, (newState: Partial<T>) => void] => {
  const [state, updateState] = usePartialUpdater(defaultValue)

  // On route change on the same page, set the state.
  // On page load, router isn't ready immediately, so set state once it is.

  const router = useRouter()
  useEffect(() => {
    if (router.isReady) {
      updateState(router.query as Partial<T>)
    }
  }, [router.isReady, router.query])

  const setQueryState = (newState: Partial<T>) => {
    updateState(newState)

    router.replace({ query: { ...router.query, ...newState } }, undefined, {
      shallow: true,
    })
  }

  return [state, setQueryState]
}

export const usePartialUpdater = <T extends UrlParams>(defaultValue: T) => {
  return useReducer(
    (state: T, update: Partial<T>) => ({ ...state, ...update }),
    defaultValue
  )
}
