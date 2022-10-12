import { DateTimeTooltip } from './datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useIsClient } from 'web/hooks/use-is-client'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  const isClient = useIsClient()
  return (
    <DateTimeTooltip
      className="ml-1 whitespace-nowrap text-gray-400"
      time={time}
    >
      {isClient && fromNow(time)}
    </DateTimeTooltip>
  )
}
