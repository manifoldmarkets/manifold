import { DateTimeTooltip } from './widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useIsClient } from 'web/hooks/use-is-client'
import { Placement } from '@floating-ui/react'

export function RelativeTimestamp(props: {
  time: number
  className?: string
  placement?: Placement
}) {
  const { time, className, placement } = props
  const isClient = useIsClient()
  return (
    <DateTimeTooltip
      className="text-ink-400 ml-1 whitespace-nowrap"
      time={time}
      placement={placement}
    >
      <span className={className}>{isClient && fromNow(time)}</span>
    </DateTimeTooltip>
  )
}

export function RelativeTimestampNoTooltip(props: {
  time: number
  className?: string
}) {
  const { time, className } = props
  const isClient = useIsClient()
  return <span className={className}>{isClient && fromNow(time)}</span>
}
