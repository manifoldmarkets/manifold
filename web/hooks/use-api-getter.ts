import { useEffect } from 'react'

import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { api } from 'web/lib/firebase/api'
import { useEvent } from './use-event'

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P>
) => {
  const propsString = JSON.stringify(props)

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${path}-${propsString}`)

  const refresh = useEvent(async () => {
    const data = await api(path, props)
    setData(data)
  })

  useEffect(() => {
    refresh()
  }, [propsString])

  return { data, refresh }
}
