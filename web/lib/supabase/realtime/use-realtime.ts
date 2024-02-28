import { useEffect, useId, useRef } from 'react'
import { RealtimeChannel } from '@supabase/realtime-js'
import { TableName, Row } from 'common/supabase/utils'
import {
  Change,
  Event,
  Filter,
  SubscriptionStatus,
  buildFilterString,
} from 'common/supabase/realtime'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { db } from 'web/lib/supabase/db'

export type BindingSpec<
  T extends TableName = TableName,
  E extends Event = Event
> = {
  table: T
  event: E
  filter?: Filter<T>
}

export type RealtimeOptions<T extends TableName, E extends Event> = {
  bindings: BindingSpec<T, E>[]
  onChange: (change: Change<T, E>) => void
  onStatus?: (status: SubscriptionStatus, err?: Error) => void
  onEnabled?: (enabled: boolean) => void
  enableBackground?: boolean
}

function getChannelFilter<T extends TableName, E extends Event>(
  spec: BindingSpec<T, E>
) {
  const { event, table, filter } = spec
  const filterString = filter ? buildFilterString(filter) : undefined
  return { event, table, filter: filterString, schema: 'public' } as const
}

export function useRealtime<T extends TableName, E extends Event>(
  opts: RealtimeOptions<T, E>
) {
  const { bindings, onChange, onStatus, onEnabled, enableBackground } = opts
  const channelId = `${useId()}`

  const channel = useRef<RealtimeChannel | undefined>()
  const isVisible = useIsPageVisible()

  useEffect(() => {
    if (isVisible || enableBackground) {
      onEnabled?.(true)
      const chan = (channel.current = db.channel(channelId))
      for (const spec of bindings) {
        // mqp: realtime-js use of overloads makes this part hard to type correctly
        const opts = getChannelFilter(spec) as any
        chan.on<Row<T>>('postgres_changes', opts, ((c: any) => {
          // if we got this change over a channel we have recycled, ignore it
          if (channel.current === chan) {
            onChange(c)
          }
        }) as any)
      }
      chan.subscribe((status, err) => {
        if (onStatus != null) {
          onStatus(status, err)
        } else {
          if (err != null) {
            console.error(err)
          }
        }
      })
      return () => {
        onEnabled?.(false)
        db.removeChannel(chan)
        channel.current = undefined
      }
    }
  }, [isVisible || enableBackground])

  return channel
}
