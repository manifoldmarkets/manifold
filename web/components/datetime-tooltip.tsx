import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import advanced from 'dayjs/plugin/advancedFormat'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advanced)

export function DateTimeTooltip(props: {
  time: number
  text?: string
  children?: React.ReactNode
}) {
  const { time, text } = props

  const formattedTime = dayjs(time).format('MMM DD, YYYY hh:mm a z')
  const toolTip = text ? `${text} ${formattedTime}` : formattedTime

  return (
    <>
      <span
        className="tooltip cursor-default hidden sm:inline-block"
        data-tip={toolTip}
      >
        {props.children}
      </span>
      <span className="sm:hidden">{props.children}</span>
    </>
  )
}
