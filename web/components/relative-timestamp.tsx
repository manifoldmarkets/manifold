import { DateTimeTooltip } from './datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import React from 'react'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  return (
    <DateTimeTooltip time={time}>
      <span className="ml-1 whitespace-nowrap text-gray-400 dark:text-gray-600">
        {fromNow(time)}
      </span>
    </DateTimeTooltip>
  )
}
