import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'

dayjs.extend(duration)

const getTimeUntil = (year: number) => {
  const eventYear = Math.floor(year)
  const eventMonth = Math.round((year - eventYear) * 12)
  const eventDate = new Date(eventYear, eventMonth, 1)

  const currentTime = dayjs()
  const difference = dayjs(eventDate).diff(currentTime)

  const years = Math.floor(dayjs.duration(difference).asYears())
  const months = Math.floor(dayjs.duration(difference).asMonths()) % 12
  const days = Math.floor(dayjs.duration(difference).asDays()) % 30
  const hours = Math.floor(dayjs.duration(difference).asHours()) % 24
  const minutes = Math.floor(dayjs.duration(difference).asMinutes()) % 60
  const seconds = Math.floor(dayjs.duration(difference).asSeconds()) % 60

  return {
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
  }
}

export const Clock = (props: { year: number }) => {
  const { year } = props
  const [timeUntil, setTimeUntil] = useState(getTimeUntil(year))

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUntil(getTimeUntil(year))
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [year])

  return (
    <Row className={'gap-1 text-xl sm:text-7xl'}>
      <Row
        className={
          ' justify-center gap-2 rounded-lg bg-gray-700 p-4 text-red-600 ring-8 ring-gray-300 sm:gap-4 sm:pl-10 sm:pr-6'
        }
      >
        <TimeUnit value={timeUntil.years} unit={'years'} />
        <span>:</span>
        <TimeUnit value={timeUntil.months} unit={'months'} />
        <span>:</span>
        <TimeUnit value={timeUntil.days} unit={'days'} />
        <span>:</span>
        <TimeUnit value={timeUntil.hours} unit={'hours'} />
        <span>:</span>
        <TimeUnit unit={'minutes'} value={timeUntil.minutes} />
        <span>:</span>
        <Col className={'items-start sm:w-20'}>
          <span>{timeUntil.seconds}</span>
          <span className={'ml-1 text-xs sm:text-sm'}>seconds</span>
        </Col>
      </Row>
    </Row>
  )
}
const TimeUnit = (props: { value: number; unit: string }) => {
  const { value, unit } = props
  return (
    <Col className={'items-center'}>
      <span>{value}</span>
      <span className={'text-xs sm:text-sm'}>{unit}</span>
    </Col>
  )
}
