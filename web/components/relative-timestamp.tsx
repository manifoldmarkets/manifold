import { DateTimeTooltip } from './datetime-tooltip'
import dayjs from 'dayjs'
import React from 'react'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  const dayJsTime = dayjs(time)
  return (
    <DateTimeTooltip
      className="ml-1 whitespace-nowrap text-gray-400"
      time={dayJsTime}
    >
      {dayJsTime.fromNow()}
    </DateTimeTooltip>
  )
}
