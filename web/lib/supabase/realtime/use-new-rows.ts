import { useCallback, useState } from 'react'
import { TableName, Row } from 'common/supabase/utils'
import { useRealtimeChannel } from './use-realtime'
import { Change, Filter } from 'common/supabase/realtime'

export function useNewRows<T extends TableName>(table: T, filter?: Filter<T>) {
  const [rows, setRows] = useState<Row<T>[]>([])
  const onChange = useCallback((c: Change<T, 'INSERT'>) => {
    setRows((rs) => [...rs, c.new])
  }, [])
  useRealtimeChannel({ event: 'INSERT', table, filter, onChange })
  return rows
}
