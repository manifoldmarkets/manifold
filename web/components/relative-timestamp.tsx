import { DateTimeTooltip } from './datetime-tooltip'
import React from 'react'
import { fromNow } from 'web/lib/util/time'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip
      className="ml-1 whitespace-nowrap text-gray-400"
      time={time}
    >
      {fromNow(time)}
    </DateTimeTooltip>
  )
}
