import { useEffect } from 'react'

import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { APIError, api } from 'web/lib/firebase/api'
import { useEvent } from './use-event'

const promiseCache: Record<string, Promise<any> | undefined> = {}

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined
) => {
  const propsString = JSON.stringify(props)

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${path}-${propsString}`)

  const key = `${path}-${propsString}-error`
  const [error, setError] = usePersistentInMemoryState<APIError | undefined>(
    undefined,
    key
  )

  const refresh = useEvent(async () => {
    if (!props) return

    const cachedPromise = promiseCache[key]
    if (cachedPromise) {
      await cachedPromise.then(setData).catch(setError)
    } else {
      const promise = api(path, props)
      promiseCache[key] = promise
      await promise.then(setData).catch(setError)
      promiseCache[key] = undefined
    }
  })

  useEffect(() => {
    refresh()
  }, [propsString])

  return { data, error, refresh }
}
