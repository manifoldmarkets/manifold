import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Display } from './display'
import clsx from 'clsx'
import { useIsClient } from 'web/hooks/use-is-client'

dayjs.extend(duration)

export const getTimeUntil = (year: number) => {
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

export const getTimeUntilFromMs = (ms: number) => {
  const currentTime = dayjs()
  const eventTime = dayjs(ms)
  const difference = eventTime.diff(currentTime)

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

export const Clock = (props: {
  year?: number
  ms?: number
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  url?: string
}) => {
  const { year, ms, className, size = 'lg', url } = props
  const [timeUntil, setTimeUntil] = useState(
    ms !== undefined
      ? getTimeUntilFromMs(ms)
      : year !== undefined
      ? getTimeUntil(year)
      : getTimeUntil(0)
  )
  const isClient = useIsClient()
  useEffect(() => {
    const timer = setInterval(() => {
      if (ms !== undefined) {
        setTimeUntil(getTimeUntilFromMs(ms))
      } else if (year !== undefined) {
        setTimeUntil(getTimeUntil(year))
      }
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [year, ms])

  // Sizing configuration based on size prop
  const sizeConfig = {
    xs: {
      clockText: 'text-xs sm:text-sm',
      dotSize: 'h-0.5 w-0.5 sm:h-1 sm:w-1',
      dotGap: 'gap-1 sm:gap-1.5',
      padding: 'p-1 sm:p-1.5',
      displayHeight: { mobile: 15, desktop: 20 },
      unitText: 'text-[8px] sm:text-xs',
      columnGap: 'gap-0.5 sm:gap-1',
      ringSize: 'ring-1',
    },
    sm: {
      clockText: 'text-sm sm:text-base',
      dotSize: 'h-0.5 w-0.5 sm:h-1 sm:w-1',
      dotGap: 'gap-1.5 sm:gap-2',
      padding: 'p-2 sm:p-2.5',
      displayHeight: { mobile: 20, desktop: 30 },
      unitText: 'text-[9px] sm:text-xs',
      columnGap: 'gap-0.5 sm:gap-1.5',
      ringSize: 'ring-1',
    },
    md: {
      clockText: 'text-base sm:text-2xl',
      dotSize: 'h-1 w-1 sm:h-1.5 sm:w-1.5',
      dotGap: 'gap-2 sm:gap-3',
      padding: 'p-3 sm:p-3.5',
      displayHeight: { mobile: 25, desktop: 40 },
      unitText: 'text-[10px] sm:text-sm',
      columnGap: 'gap-1 sm:gap-2',
      ringSize: 'ring-1',
    },
    lg: {
      clockText: 'text-xl sm:text-7xl',
      dotSize: 'h-1 w-1 sm:h-1.5 sm:w-1.5',
      dotGap: 'gap-2.5 sm:gap-4',
      padding: 'p-4 sm:p-4',
      displayHeight: { mobile: 30, desktop: 60 },
      unitText: 'text-xs sm:text-sm',
      columnGap: 'gap-1.5 sm:gap-3',
      ringSize: 'ring-2',
    },
  }

  const config = sizeConfig[size]
  const dotClass = clsx(config.dotSize, 'rounded-sm')

  const colon = (
    <Col className={clsx('h-full justify-center', config.dotGap)}>
      <div style={{ backgroundColor: 'red' }} className={dotClass} />
      <div
        style={{ backgroundColor: 'red' }}
        className={clsx('mb-2 sm:mb-4', dotClass)}
      />
    </Col>
  )

  return (
    <Row className={clsx(config.clockText, 'w-full gap-1', className)}>
      <Row
        style={{ color: 'red' }}
        className={clsx(
          'w-full justify-center rounded-lg bg-gray-900 ring ring-gray-300',
          config.padding,
          config.columnGap,
          config.ringSize
        )}
      >
        <TimeUnit
          value={timeUntil.years.toString()}
          unit={'years'}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
        {colon}
        <TimeUnit
          value={timeUntil.months.toString()}
          unit={'months'}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
        {colon}
        <TimeUnit
          value={timeUntil.days.toString()}
          unit={'days'}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
        {colon}
        <TimeUnit
          value={timeUntil.hours.toString()}
          unit={'hours'}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
        {colon}
        <TimeUnit
          unit={'minutes'}
          value={timeUntil.minutes.toString()}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
        {colon}
        {/* We want to show the -- for the changing seconds */}
        <TimeUnit
          unit={'seconds'}
          value={isClient ? timeUntil.seconds : null}
          displayHeight={config.displayHeight}
          unitTextClass={config.unitText}
        />
      </Row>
    </Row>
  )
}

const TimeUnit = (props: {
  value: number | string | null
  unit: string
  displayHeight?: { mobile: number; desktop: number }
  unitTextClass?: string
}) => {
  const {
    value,
    unit,
    displayHeight = { mobile: 30, desktop: 60 },
    unitTextClass = 'text-xs font-bold sm:text-sm',
  } = props
  return (
    <Col className={'items-center'}>
      <div className={'sm:hidden'}>
        <Display height={displayHeight.mobile} value={value} />
      </div>
      <div className={'hidden sm:block'}>
        <Display height={displayHeight.desktop} value={value} />
      </div>
      <span className={unitTextClass}>{unit}</span>
    </Col>
  )
}
