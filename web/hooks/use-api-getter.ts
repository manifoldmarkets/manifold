import { useEffect } from 'react'

import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { APIError, api } from 'web/lib/firebase/api'
import { useEvent } from './use-event'

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined
) => {
  const propsString = JSON.stringify(props)

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${path}-${propsString}`)

  const [error, setError] = usePersistentInMemoryState<APIError | undefined>(
    undefined,
    `${path}-${propsString}-error`
  )

  const refresh = useEvent(async () => {
    if (!props) return
    await api(path, props)
      .then(setData)
      .catch((e) => setError(e))
  })

  useEffect(() => {
    refresh()
  }, [propsString])

  return { data, error, refresh }
}
