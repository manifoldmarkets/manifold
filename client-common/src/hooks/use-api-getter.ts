import { useEffect, useRef, useState } from 'react'
import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEvent } from './use-event'
import { apiWithoutAuth } from '../lib/api'
import { APIError } from 'common/api/utils'
const promiseCache: Record<string, Promise<unknown> | undefined> = {}

// Prepopulate cache with data, e.g. from static props
export function prepopulateCache<P extends APIPath>(
  path: P,
  props: APIParams<P>,
  data: APIResponse<P>
) {
  const key = `${path}-${JSON.stringify(props)}`
  promiseCache[key] = Promise.resolve(data)
}

// react query at home
export const useAPIGetterWithCall = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined,
  apiCall: apiWithoutAuth<P>, // we pass the auth from web or mani in the call so it doesn't have to be referenced in this hook
  ignoreDependencies?: string[],
  overrideKey?: string,
  enabled = true
) => {
  const propsString = JSON.stringify(props)
  const propsStringToTriggerRefresh = JSON.stringify(
    deepCopyWithoutKeys(props, ignoreDependencies || [])
  )

  const [loading, setLoading] = useState(false)

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${overrideKey ?? path}`)

  const key = `${path}-${propsString}`
  const [error, setError] = usePersistentInMemoryState<APIError | undefined>(
    undefined,
    key
  )
  // The request the data came from. Data is shared across props, so a failed
  // read for new props must not leave the old props' data showing as its own.
  const [dataKey, setDataKey] = usePersistentInMemoryState<string | undefined>(
    undefined,
    `${overrideKey ?? path}-data-key`
  )

  // Every call gets a generation number. A response that lands after a newer
  // call (different props, or a refresh) is dropped: the setter always writes
  // to the latest key, so applying it would show stale data under new props.
  const generation = useRef(0)
  const getAndSetData = useEvent(async () => {
    if (!props || !enabled) return
    setError(undefined)
    const mine = ++generation.current

    let promise = promiseCache[key] as Promise<APIResponse<P>> | undefined
    if (!promise) {
      promise = apiCall(path, props)
      promiseCache[key] = promise
    }

    setLoading(true)
    try {
      const result = await promise
      if (mine === generation.current) {
        setData(result)
        setDataKey(key)
      }
    } catch (error) {
      // Cache only successful reads. Every subscriber handles the rejection,
      // and a remount can retry instead of reusing an empty resolved promise.
      if (promiseCache[key] === promise) delete promiseCache[key]
      if (mine === generation.current) {
        setError(error as APIError)
        // A failed refresh keeps its last good data; anything else is cleared.
        if (dataKey !== key) setData(undefined)
      }
    } finally {
      if (mine === generation.current) setLoading(false)
    }
  })

  useEffect(() => {
    getAndSetData()
    return () => {
      generation.current++
      setLoading(false)
    }
  }, [propsStringToTriggerRefresh, enabled])

  const refresh = async () => {
    promiseCache[key] = undefined
    await getAndSetData()
  }

  return { data, error, refresh, setData, loading }
}

function deepCopyWithoutKeys(obj: any, keysToRemove: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopyWithoutKeys(item, keysToRemove))
  }

  if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {}
    for (const key in obj) {
      if (!keysToRemove.includes(key)) {
        newObj[key] = deepCopyWithoutKeys(obj[key], keysToRemove)
      }
    }
    return newObj
  }

  return obj
}
