import clsx from 'clsx'

export const PREF_AGE_MIN = 18
export const PREF_AGE_MAX = 100

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
