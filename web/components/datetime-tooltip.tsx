import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import advanced from 'dayjs/plugin/advancedFormat'
import { Tooltip } from './tooltip'

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

  return <Tooltip text={toolTip}>{props.children}</Tooltip>
}
