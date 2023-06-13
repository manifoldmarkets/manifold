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

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

function fromNowTiny(time: number) {
  const diffInHours = dayjs().diff(dayjs(time), 'hour')
  const diffInDays = dayjs().diff(dayjs(time), 'day')
  if (diffInDays === 0) {
    return `${diffInHours}h`
  } else if (diffInDays === 1) {
    return '1d'
  } else if (diffInDays < 7) {
    return `${diffInDays}d`
  } else if (diffInDays < 30) {
    return `${Math.floor(diffInDays / 7)}w`
  } else if (diffInDays < 365) {
    return `${Math.floor(diffInDays / 30)}m`
  } else {
    return `${Math.floor(diffInDays / 365)}y`
  }
}

export function TinyRelativeTimestamp(props: {
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
      <span className={className}>{isClient && fromNowTiny(time)}</span>
    </DateTimeTooltip>
  )
}
