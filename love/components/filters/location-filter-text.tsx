import clsx from 'clsx'

export const PREF_AGE_MIN = 18
export const PREF_AGE_MAX = 100

export function LocationFilterText(props: {
  locationFilterOn: boolean
  radius: number
  highlightedClass?: string
}) {
  const { locationFilterOn, radius, highlightedClass } = props

  if (!locationFilterOn) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>Any</span>{' '}
        location
      </span>
    )
  }
  return (
    <span>
      <span className={clsx('text-semibold', highlightedClass)}>{radius}</span>{' '}
      miles near you
    </span>
  )
}
