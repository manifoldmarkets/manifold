import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Slider } from 'web/components/widgets/slider'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Row } from 'web/components/layout/row'
import { City, CitySearchBox } from '../search-location'
import { XCircleIcon } from '@heroicons/react/outline'
import { Lover } from 'common/love/lover'

export const PREF_AGE_MIN = 18
export const PREF_AGE_MAX = 100

export type OriginLocation = { id: string; name: string }

export function LocationFilterText(props: {
  nearbyOriginLocation: OriginLocation | undefined | null
  youLover: Lover | undefined | null
  radius: number
  highlightedClass?: string
}) {
  const { nearbyOriginLocation, youLover, radius, highlightedClass } = props

  if (!nearbyOriginLocation) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>Any</span>
        <span className="hidden sm:inline"> location</span>
      </span>
    )
  }
  return (
    <span>
      <span className="hidden sm:inline">
        <span className={clsx('text-semibold', highlightedClass)}>
          {radius}
        </span>{' '}
        miles
      </span>{' '}
      <span className="capitalize sm:normal-case">near</span>{' '}
      <span className={highlightedClass}>
        {youLover?.geodb_city_id == nearbyOriginLocation.id
          ? 'you'
          : nearbyOriginLocation.name}
      </span>
    </span>
  )
}

export type LocationFilterProps = {
  nearbyOriginLocation: OriginLocation | undefined | null
  setNearbyOriginLocation: (location: OriginLocation | undefined | null) => void
  radius: number
  setRadius: (radius: number) => void
}

export function LocationFilter(props: {
  youLover: Lover | undefined | null
  locationFilterProps: LocationFilterProps
}) {
  const { youLover } = props

  const { nearbyOriginLocation, setNearbyOriginLocation, radius, setRadius } =
    props.locationFilterProps

  const [otherOriginLocation, setOtherOriginLocation] =
    usePersistentInMemoryState<OriginLocation | undefined | null>(
      undefined,
      'other-origin-location'
    )

  const nearYouChecked =
    !!youLover &&
    !!youLover.geodb_city_id &&
    !!nearbyOriginLocation &&
    nearbyOriginLocation.id === youLover.geodb_city_id

  const otherCityChecked =
    !!nearbyOriginLocation && !nearYouChecked && !!otherOriginLocation

  return (
    <Col className={clsx('w-full gap-1')}>
      {youLover && youLover.geodb_city_id && (
        <Checkbox
          label={nearYouChecked ? `${radius} miles near you` : 'Near you'}
          checked={nearYouChecked}
          toggle={(checked: boolean) => {
            if (checked) {
              setNearbyOriginLocation({
                id: youLover.geodb_city_id as string,
                name: youLover.city,
              })
            } else {
              setNearbyOriginLocation(undefined)
            }
          }}
        />
      )}
      {nearYouChecked && (
        <DistanceSlider radius={radius} setRadius={setRadius} />
      )}
      <Row className="items-center gap-1 ">
        <Checkbox
          label={
            otherCityChecked && otherOriginLocation
              ? `${radius} miles near`
              : 'Near'
          }
          checked={otherCityChecked}
          toggle={(checked: boolean) => {
            if (checked) {
              setNearbyOriginLocation(otherOriginLocation)
            } else {
              setNearbyOriginLocation(undefined)
            }
          }}
          disabled={!otherOriginLocation}
        />
        <CitySearchBox
          onCitySelected={(city: City | undefined) => {
            if (city) {
              setOtherOriginLocation({
                id: city.geodb_city_id,
                name: city.city,
              })
              setNearbyOriginLocation({
                id: city.geodb_city_id,
                name: city.city,
              })
            }
          }}
          searchBoxClassName="!px-1 border-0 bg-transparent focus:ring-transparent focus:ring-0 focus:border-b rounded-none h-8"
          selected={!!otherOriginLocation}
          selectedNode={
            <button
              onClick={() => {
                // If the `otherOriginLocation` is the same as the current `nearbyOriginLocation`, set it to undefined
                if (
                  nearbyOriginLocation &&
                  otherOriginLocation &&
                  nearbyOriginLocation.id === otherOriginLocation.id
                ) {
                  setNearbyOriginLocation(undefined)
                }
                setOtherOriginLocation(undefined)
              }}
              className="hover:text-primary-500 flex flex-row items-center gap-0.5"
            >
              {' '}
              {otherOriginLocation?.name}
              <XCircleIcon className="h-4 w-4 opacity-60" />
            </button>
          }
          excludeCityIds={
            youLover && youLover.geodb_city_id
              ? [youLover?.geodb_city_id]
              : undefined
          }
          placeholder="search city"
        />
      </Row>
      {otherCityChecked && (
        <DistanceSlider radius={radius} setRadius={setRadius} />
      )}
    </Col>
  )
}

function DistanceSlider(props: {
  radius: number
  setRadius: (radius: number) => void
}) {
  const { radius, setRadius } = props

  // New snap values
  const snapValues = [10, 50, 100, 200, 300]

  // Function to snap to the closest value
  const snapToValue = (value: number) => {
    const closest = snapValues.reduce((prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    )
    setRadius(closest)
  }

  const min = snapValues[0]
  const max = snapValues[snapValues.length - 1]
  return (
    <Slider
      min={min} // The minimum snap value
      max={max} // The maximum snap value
      amount={radius}
      onChange={snapToValue}
      className="mb-4 w-full"
      marks={snapValues.map((value) => ({
        value: ((value - min) / max) * 100,
        label: value.toString(),
      }))}
    />
  )
}
