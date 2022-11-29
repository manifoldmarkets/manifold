import { DateTimeTooltip } from './widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useIsClient } from 'web/hooks/use-is-client'

export function RelativeTimestamp(props: { time: number; className?: string }) {
  const { time, className } = props
  const isClient = useIsClient()
  return (
    <DateTimeTooltip className="ml-1 whitespace-nowrap" time={time}>
      <span className={className}>{isClient && fromNow(time)}</span>
    </DateTimeTooltip>
  )
}
