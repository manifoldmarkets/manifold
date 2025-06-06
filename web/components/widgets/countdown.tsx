import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { getCountdownString } from 'client-common/lib/time'

export function Countdown(props: {
  endDate: Date
  className?: string
  includeSeconds?: boolean
}) {
  const { endDate, className, includeSeconds } = props

  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    setCountdown(getCountdownString(endDate, includeSeconds))

    const intervalId = setInterval(() => {
      setCountdown(getCountdownString(endDate, includeSeconds))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [endDate])

  return (
    <span suppressHydrationWarning className={clsx(className)}>
      {countdown}
    </span>
  )
}
