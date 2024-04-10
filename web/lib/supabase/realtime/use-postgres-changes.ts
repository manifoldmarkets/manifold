import { useId } from 'react'
import { TableName, Row } from 'common/supabase/utils'
import {
  Change,
  Event,
  Filter,
  buildFilterString,
} from 'common/supabase/realtime'
import {
  ChannelOptions,
  useChannel,
} from 'web/lib/supabase/realtime/use-channel'

export type BindingSpec<
  T extends TableName = TableName,
  E extends Event = Event
> = {
  table: T
  event: E
  filter?: Filter<T>
}

export type PostgresChangesOptions<
  T extends TableName,
  E extends Event
> = ChannelOptions & {
  bindings: BindingSpec<T, E>[]
  onChange: (change: Change<T, E>) => void
}

function getChannelFilter<T extends TableName, E extends Event>(
  spec: BindingSpec<T, E>
) {
  const { event, table, filter } = spec
  const filterString = filter ? buildFilterString(filter) : undefined
  return { event, table, filter: filterString, schema: 'public' } as const
}

export function usePostgresChanges<T extends TableName, E extends Event>(
  opts: PostgresChangesOptions<T, E>
) {
  const { bindings, onChange, onEnabled, ...rest } = opts
  const channelId = `${useId()}`
  const channel = useChannel(channelId, {
    onEnabled: (chan) => {
      for (const spec of bindings) {
        // mqp: realtime-js use of overloads makes this part hard to type correctly
        const filter = getChannelFilter(spec) as any
        chan.on<Row<T>>('postgres_changes', filter, ((c: any) => {
          // if we got this change over a channel we have recycled, ignore it
          if (channel.current === chan) {
            onChange(c)
          }
        }) as any)
      }
      onEnabled?.(chan)
    },
    ...rest,
  })
  return channel
}
