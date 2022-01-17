import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import advanced from 'dayjs/plugin/advancedFormat'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advanced)

export function DateTimeTooltip(props: {
  time: number
  children?: React.ReactNode
}) {
  const { time } = props
  return (
    <span
      className="tooltip cursor-default overflow-hidden"
      data-tip={dayjs(time).format('MMM DD, YYYY hh:mm a z')}
    >
      {props.children}
    </span>
  )
}
