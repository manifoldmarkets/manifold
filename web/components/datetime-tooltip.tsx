import dayjs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import advanced from 'dayjs/plugin/advancedFormat'
import { Tooltip } from './tooltip'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(advanced)

export function DateTimeTooltip(props: {
  time: Dayjs
  text?: string
  className?: string
  children?: React.ReactNode
  noTap?: boolean
}) {
  const { className, time, text, noTap } = props

  const formattedTime = time.format('MMM DD, YYYY hh:mm a z')
  const toolTip = text ? `${text} ${formattedTime}` : formattedTime

  return (
    <Tooltip className={className} text={toolTip} noTap={noTap}>
      {props.children}
    </Tooltip>
  )
}
