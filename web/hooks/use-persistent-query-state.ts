import { useRouter } from 'next/dist/client/router'
import { useEffect, useState } from 'react'
import { pickBy } from 'lodash'

type UrlParams = Record<string, string | undefined>

// for updating multiple query params
export const usePersistentQueriesState = <T extends UrlParams>(
  defaultValue: T,
  pushState?: boolean
): [T, (newState: Partial<T>) => void] => {
  const [state, setState] = useState(defaultValue)

  // On route change on the same page, set the state.
  // On page load, router isn't ready immediately, so set state once it is.

  const router = useRouter()
  useEffect(() => {
    if (router.isReady) {
      setState({ ...defaultValue, ...(router.query as Partial<T>) })
    }
  }, [router.isReady, router.query])

  const updateState = (update: Partial<T>) => {
    const newState = { ...state, ...update }
    setState(newState)
    const query = pickBy(newState, (v) => v)
    if (pushState) {
      router.push({ query })
    } else {
      router.replace({ query }, undefined, {
        shallow: true,
      })
    }
  }

  return [state, updateState]
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
