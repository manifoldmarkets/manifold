import { useEffect } from 'react'
import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { APIError, api } from 'web/lib/api/api'
import { useEvent } from './use-event'

const promiseCache: Record<string, Promise<any> | undefined> = {}

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined,
  ingoreDependencies?: string[],
  overrideKey?: string
) => {
  const propsString = JSON.stringify(props)
  const propsStringToTriggerRefresh = JSON.stringify(
    deepCopyWithoutKeys(props, ingoreDependencies || [])
  )

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${overrideKey ?? path}`)

  const key = `${path}-${propsString}-error`
  const [error, setError] = usePersistentInMemoryState<APIError | undefined>(
    undefined,
    key
  )

  const getAndSetData = useEvent(async () => {
    if (!props) return
    setError(undefined)

    let promise = promiseCache[key]
    if (!promise) {
      promise = api(path, props).catch(setError)
      promiseCache[key] = promise
    }

    const k = key
    const result = await promise
    if (k === key) setData(result)
  })

  useEffect(() => {
    setData(undefined)
    getAndSetData()
  }, [propsStringToTriggerRefresh])

  const refresh = async () => {
    promiseCache[key] = undefined
    setData(undefined)
    await getAndSetData()
  }

  return { data, error, refresh, setData }
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
