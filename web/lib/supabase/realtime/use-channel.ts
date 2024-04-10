import { useEffect, useRef } from 'react'
import { RealtimeChannel } from '@supabase/realtime-js'
import { SubscriptionStatus } from 'common/supabase/realtime'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { db } from 'web/lib/supabase/db'

// true = channel is always open
// false = channel is never open
// foreground = channel is open only when tab is foregrounded
export type EnabledCondition = true | false | 'foreground'

export type ChannelOptions = {
  onStatus?: (status: SubscriptionStatus, err?: Error) => void
  onEnabled?: (chan: RealtimeChannel) => void
  onDisabled?: () => void
  enabled?: EnabledCondition
}

export function useChannel(id: string, opts: ChannelOptions) {
  const { onStatus, onEnabled, onDisabled } = opts

  const channel = useRef<RealtimeChannel | undefined>()

  // default to foreground -- we typically don't want people with a bunch of
  // open manifold tabs in their browser to be getting streamed changes in those
  // tabs forever
  const enabled = opts.enabled ?? 'foreground'
  const isVisible = useIsPageVisible()
  const isActive = enabled === true || (enabled === 'foreground' && isVisible)

  useEffect(() => {
    if (isActive) {
      const chan = (channel.current = db.channel(id))
      onEnabled?.(chan)
      chan.subscribe((status, err) => {
        if (err != null) {
          console.error(err)
        }
        onStatus?.(status, err)
      })
      return () => {
        onDisabled?.()
        db.removeChannel(chan)
        channel.current = undefined
      }
    }
  }, [id, isActive])

  return channel
}
