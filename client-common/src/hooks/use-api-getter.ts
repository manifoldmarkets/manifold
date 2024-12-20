import { useEffect, useState } from 'react'
import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEvent } from './use-event'
import { apiWithAuth, apiWithoutAuth } from '../lib/api'
import { APIError } from 'common/api/utils'
const promiseCache: Record<string, Promise<any> | undefined> = {}

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
  apiCall: apiWithoutAuth<P>,
  ignoreDependencies?: string[],
  overrideKey?: string
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

  const getAndSetData = useEvent(async () => {
    if (!props) return
    setError(undefined)

    let promise = promiseCache[key]
    if (!promise) {
      setLoading(true)
      promise = apiCall(path, props)
        .catch(setError)
        .finally(() => setLoading(false))
      promiseCache[key] = promise
    }

    const k = key
    const result = await promise
    if (k === key) setData(result)
  })

  useEffect(() => {
    getAndSetData()
    return () => {
      setLoading(false)
    }
  }, [propsStringToTriggerRefresh])

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
