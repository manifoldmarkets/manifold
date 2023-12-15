import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { pickBy } from 'lodash'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

type UrlParams = Record<string, string | undefined>

// for updating multiple query params
export const usePersistentQueriesState = <T extends UrlParams>(
  defaultValue: T
): [T, (newState: Partial<T>) => void, boolean] => {
  const [state, setState] = useState(defaultValue)

  // On route change on the same page, set the state.
  // On page load, router isn't ready immediately, so set state once it is.

  const router = useRouter()
  const { searchParams } = useDefinedSearchParams()
  const pathName = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
    const entries = Object.fromEntries(searchParams.entries())
    setState({ ...defaultValue, ...entries })
  }, [searchParams])

  const updateState = (update: Partial<T>) => {
    const newState = { ...state, ...update }
    setState(newState)
    const query = pickBy(newState, (v) => v)
    const newQ = Object.keys(query)
      .map((key) => `${key}=${query[key]}`)
      .join('&')
    router.replace(pathName + '?' + newQ)
  }

  return [state, updateState, ready]
}

export const usePersistentQueryState = <K extends string>(
  key: K,
  defaultValue: string
): [string | undefined, (newState: string) => void] => {
  const [state, updateState] = usePersistentQueriesState({
    [key]: defaultValue,
  })
  return [
    state ? state[key] : undefined,
    (newState: string) => updateState({ [key]: newState }),
  ]
}
