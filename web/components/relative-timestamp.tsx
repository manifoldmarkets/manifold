import { DateTimeTooltip } from './datetime-tooltip'
import { fromNow } from '../lib/util/time'
import React from 'react'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="ml-1 whitespace-nowrap text-gray-400">
        {fromNow(time)}
      </span>
    </DateTimeTooltip>
  )
}
