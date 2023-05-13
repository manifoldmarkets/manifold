import { useEffect, useId, useRef, useState } from 'react'
import { RealtimeChannel } from '@supabase/realtime-js'
import { TableName, Row } from 'common/supabase/utils'
import { Filter, buildFilterString } from 'common/supabase/realtime'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { db } from 'web/lib/supabase/db'

export function useLiveStream<T extends TableName>(
  table: T,
  filter?: Filter<T>
) {
  const filterString = filter ? buildFilterString(filter) : undefined
  const channelId = `${table}-${useId()}`
  const channel = useRef<RealtimeChannel | undefined>()
  const [changes, setChanges] = useState<Row<T>[]>([])
  const isVisible = useIsPageVisible()

  useEffect(() => {
    if (isVisible) {
      const opts = {
        event: 'INSERT',
        schema: 'public',
        table,
        filter: filterString
      } as const
      const chan = channel.current = db.channel(channelId)
      chan.on<Row<T>>('postgres_changes', opts, (change) => {
        // if we got this change over a channel we have recycled, ignore it
        if (channel.current === chan) {
          setChanges((cs) => [...cs, change.new])
        }
      }).subscribe((_status, err) => {
        if (err) {
          console.error(err)
        }
      })
      return () => {
        db.removeChannel(chan)
        channel.current = undefined
      }
    }
  }, [table, filterString, isVisible])

  return changes
}
