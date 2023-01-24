import { Period } from 'web/lib/firebase/users'
import { ChoicesToggleGroup, ColorType } from '../choices-toggle-group'
import { GraphMode } from '../portfolio/portfolio-value-graph'

const labels: { [label: string]: Period } = {
  '1D': 'daily',
  '1W': 'weekly',
  '1M': 'monthly',
  ALL: 'allTime',
}

export const TimeRangePicker = (props: {
  currentTimePeriod: Period
  setCurrentTimePeriod: (period: Period) => void
  color?: ColorType
  disabled?: boolean
}) => {
  const { currentTimePeriod, setCurrentTimePeriod, color, disabled } = props

  return (
    <ChoicesToggleGroup
      currentChoice={currentTimePeriod}
      choicesMap={labels}
      setChoice={setCurrentTimePeriod as any}
      disabled={disabled}
      color={color}
      className="mt-1 !gap-1 self-start !shadow-none"
      toggleClassName="py-1 !px-1"
    />
  )
}
