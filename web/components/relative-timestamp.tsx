import { DateTimeTooltip } from './datetime-tooltip'
import React, { useEffect, useState } from 'react'
import { fromNow } from 'web/lib/util/time'

export function RelativeTimestamp(props: { time: number }) {
  const { time } = props
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    // Only render on client to prevent difference from server.
    setIsClient(true)
  }, [])

  return (
    <DateTimeTooltip
      className="ml-1 whitespace-nowrap text-gray-400"
      time={time}
    >
      {isClient ? fromNow(time) : ''}
    </DateTimeTooltip>
  )
}
