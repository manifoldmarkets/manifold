import { useCallback, useState } from 'react'
import { TableName } from 'common/supabase/utils'
import { useRealtime } from './use-realtime'
import { Change, Event, Filter } from 'common/supabase/realtime'

export function useChanges<T extends TableName, E extends Event>(
  table: T,
  event: E,
  filter?: Filter<T>
) {
  const [changes, setChanges] = useState<Change<T, E>[]>([])
  const onChange = useCallback((c: Change<T, E>) => {
    setChanges((cs) => [...cs, c])
  }, [])
  useRealtime({ event, table, filter, onChange })
  return changes
}
