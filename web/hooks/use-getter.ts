import { useEffect } from 'react'

import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useEvent } from './use-event'

export const useGetter = <P, R>(
  key: string,
  props: P | undefined,
  getter: (params: P) => Promise<R>
) => {
  const propsString = JSON.stringify(props)

  const [data, setData] = usePersistentInMemoryState<R | undefined>(
    undefined,
    `getter-${key}-${propsString}`
  )

  const refresh = useEvent(async () => {
    if (props === undefined) return
    const data = await getter(props)
    setData(data)
  })

  useEffect(() => {
    refresh()
  }, [propsString])

  return { data, refresh }
}
