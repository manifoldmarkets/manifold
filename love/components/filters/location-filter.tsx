import clsx from 'clsx'
import { FilterFields } from './search'
import { Col } from 'web/components/layout/col'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Slider } from 'web/components/widgets/slider'

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

export function LocationFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
  nearbyOriginLocation: string
  nearbyCities: string[] | null | undefined
  radius: number
  setRadius: (radius: number) => void
}) {
  const {
    filters,
    updateFilter,
    nearbyOriginLocation,
    nearbyCities,
    radius,
    setRadius,
  } = props

  return (
    <Col className={clsx('w-full gap-1')}>
      <Checkbox
        label={`${radius} miles near you`}
        checked={!!filters.geodbCityIds}
        toggle={(checked: boolean) => {
          if (checked) {
            updateFilter({
              geodbCityIds: [nearbyOriginLocation, ...(nearbyCities || [])],
            })
          } else {
            updateFilter({
              geodbCityIds: undefined,
            })
          }
        }}
      />
      {filters.geodbCityIds && (
        <Slider
          min={50}
          max={500}
          step={50}
          color="indigo"
          amount={radius}
          onChange={setRadius}
          className="mb-4 w-full"
          marks={[
            { value: 0, label: '50' },
            { value: 100, label: '500' },
          ]}
        />
      )}
    </Col>
  )
}
