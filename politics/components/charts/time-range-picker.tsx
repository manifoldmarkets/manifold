import clsx from 'clsx'
import { periodDurations } from 'web/lib/util/time'
import { Period } from 'web/lib/firebase/users'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'

const labels: { [label: string]: Period } = {
  '1D': 'daily',
  '1W': 'weekly',
  '1M': 'monthly',
  ALL: 'allTime',
}

export const TimeRangePicker = (props: {
  currentTimePeriod: Period | 'custom'
  setCurrentTimePeriod: (period: Period) => void
  /** milliseconds */
  maxRange?: number
  disabled?: boolean
  className?: string
  toggleClassName?: string
}) => {
  const {
    currentTimePeriod,
    setCurrentTimePeriod,
    maxRange,
    disabled,
    className,
    toggleClassName,
  } = props

  const disabledOptions = !maxRange
    ? undefined
    : Object.values(labels).filter(
        (period) => period !== 'allTime' && periodDurations[period] > maxRange
      )

  return (
    <ChoicesToggleGroup
      currentChoice={currentTimePeriod}
      choicesMap={labels}
      setChoice={setCurrentTimePeriod as any}
      disabled={disabled}
      disabledOptions={disabledOptions}
      className={clsx('!shadow-none', className)}
      toggleClassName={clsx('py-1 !px-1', toggleClassName)}
    />
  )
}
