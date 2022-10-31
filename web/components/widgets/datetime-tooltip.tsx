import { ReactNode } from 'react'
import { formatTime } from 'web/lib/util/time'
import { Tooltip } from './tooltip'

export function DateTimeTooltip(props: {
  time: number
  text?: string
  className?: string
  children?: ReactNode
  noTap?: boolean
}) {
  const { className, time, text, noTap } = props

  const formattedTime = formatTime(time)
  const toolTip = text ? `${text} ${formattedTime}` : formattedTime

  return (
    <Tooltip className={className} text={toolTip} noTap={noTap}>
      {props.children}
    </Tooltip>
  )
}
