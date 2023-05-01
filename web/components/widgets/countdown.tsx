import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { getCountdownString } from 'web/lib/util/time'

export function Countdown(props: { endDate: Date; className?: string }) {
  const { endDate, className } = props

  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCountdown(getCountdownString(endDate))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [endDate])

  return <div className={clsx(className)}>{countdown}</div>
}
