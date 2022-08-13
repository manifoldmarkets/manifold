import { DateTimeTooltip } from './datetime-tooltip'
import dayjs from 'dayjs'
import React from 'react'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  const dayJsTime = dayjs(time)
  return (
    <DateTimeTooltip time={dayJsTime}>
      <span className="ml-1 whitespace-nowrap text-gray-400">
        {dayJsTime.fromNow()}
      </span>
    </DateTimeTooltip>
  )
}
