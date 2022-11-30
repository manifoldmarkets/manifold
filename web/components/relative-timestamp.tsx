import { DateTimeTooltip } from './widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useIsClient } from 'web/hooks/use-is-client'
import { Placement } from '@floating-ui/react-dom-interactions'

export function RelativeTimestamp(props: {
  time: number
  className?: string
  placement?: Placement
}) {
  const { time, className, placement } = props
  const isClient = useIsClient()
  return (
    <DateTimeTooltip
      className="ml-1 whitespace-nowrap text-gray-400"
      time={time}
      placement={placement}
    >
      <span className={className}>{isClient && fromNow(time)}</span>
    </DateTimeTooltip>
  )
}
