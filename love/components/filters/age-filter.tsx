import clsx from 'clsx'
import { FilterFields } from './search'
import { RangeSlider } from 'web/components/widgets/slider'

export const PREF_AGE_MIN = 18
export const PREF_AGE_MAX = 99

export function AgeFilterText(props: {
  pref_age_min: number | undefined
  pref_age_max: number | undefined
  highlightedClass?: string
}) {
  const { pref_age_min, pref_age_max, highlightedClass } = props
  const noMinAge = !pref_age_min || pref_age_min <= PREF_AGE_MIN
  const noMaxAge = !pref_age_max || pref_age_max >= PREF_AGE_MAX

  if (noMinAge && noMaxAge) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>Any</span> age
      </span>
    )
  }
  if (noMinAge) {
    return (
      <span>
        Below{' '}
        <span className={clsx('text-semibold', highlightedClass)}>
          {pref_age_max}
        </span>{' '}
        years
      </span>
    )
  }
  if (noMaxAge) {
    return (
      <span>
        Above{' '}
        <span className={clsx('text-semibold', highlightedClass)}>
          {pref_age_min}
        </span>{' '}
        years
      </span>
    )
  }
  return (
    <span>
      Between{' '}
      <span className={clsx('text-semibold', highlightedClass)}>
        {pref_age_min}
      </span>{' '}
      and{' '}
      <span className={clsx('text-semibold', highlightedClass)}>
        {pref_age_max}
      </span>{' '}
      years
    </span>
  )
}

export function AgeFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
}) {
  const { filters, updateFilter } = props
  return (
    <RangeSlider
      lowValue={filters.pref_age_min ?? PREF_AGE_MIN}
      highValue={filters.pref_age_max ?? PREF_AGE_MAX}
      setValues={(low: number, high: number) => {
        updateFilter({
          pref_age_min: Number(low),
          pref_age_max: Number(high),
        })
      }}
      min={PREF_AGE_MIN}
      max={PREF_AGE_MAX}
      marks={[
        { value: 0, label: `${PREF_AGE_MIN}` },
        {
          value: ((30 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) * 100,
          label: `30`,
        },
        {
          value: ((50 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) * 100,
          label: `50`,
        },
        {
          value: ((70 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) * 100,
          label: `70`,
        },
        { value: 100, label: `${PREF_AGE_MAX}` },
      ]}
    />
  )
}
