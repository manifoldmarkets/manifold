import clsx from 'clsx'
import { Lover } from 'love/hooks/use-lover'
import { Col } from 'web/components/layout/col'
import { Subtitle } from '../widgets/lover-subtitle'
import { AgeFilter } from './age-filter'
import { GenderFilter } from './gender-filter'
import { LocationFilter } from './location-filter'
import { PrefGenderFilter } from './pref-gender-filter'
import { RelationshipFilter } from './relationship-filter'
import { FilterFields } from './search'
import { WantsKidsFilter } from './wants-kids-filter'
import { HasKidsFilter } from './has-kids-filter'

export function MobileFilters(props: {
  filters: Partial<FilterFields>
  youLover: Lover | undefined | null
  radius: number
  setRadius: (radius: number) => void
  updateFilter: (newState: Partial<FilterFields>) => void
  clearFilters: () => void
  nearbyOriginLocation: string | null | undefined
  nearbyCities: string[] | null | undefined
}) {
  const {
    filters,
    youLover,
    radius,
    setRadius,
    updateFilter,
    clearFilters,
    nearbyOriginLocation,
    nearbyCities,
  } = props

  return (
    <>
      <Col className="gap-1">
        <Subtitle>Gender</Subtitle>
        <Col>
          <GenderFilter filters={filters} updateFilter={updateFilter} />
        </Col>
      </Col>
      {/* PREFERRED GENDER */}
      <Col className="gap-1">
        <Subtitle>Preferred Gender</Subtitle>
        <Col>
          <PrefGenderFilter filters={filters} updateFilter={updateFilter} />
        </Col>
      </Col>
      {/* AGE RANGE */}
      <Col className="mb-4 gap-1">
        <Subtitle>Age</Subtitle>
        <AgeFilter filters={filters} updateFilter={updateFilter} />
      </Col>
      {/* LOCATION */}
      {youLover && nearbyOriginLocation && (
        <Col className="gap-1">
          <Subtitle>Location</Subtitle>
          <LocationFilter
            filters={filters}
            updateFilter={updateFilter}
            nearbyOriginLocation={nearbyOriginLocation}
            nearbyCities={nearbyCities}
            radius={radius}
            setRadius={setRadius}
          />
        </Col>
      )}
      {/* WANTS KIDS */}
      <Col>
        <Subtitle>Wants kids</Subtitle>
        <WantsKidsFilter filters={filters} updateFilter={updateFilter} />
      </Col>
      {/* RELATIONSHIP STYLE */}
      <Col>
        <Subtitle>Relationship Style</Subtitle>
        <RelationshipFilter filters={filters} updateFilter={updateFilter} />
      </Col>
      {/* HAS KIDS */}
      <Col>
        <Subtitle>Has kids</Subtitle>
        <HasKidsFilter filters={filters} updateFilter={updateFilter} />
      </Col>
      <button
        className="text-ink-500 hover:text-primary-500 underline"
        onClick={clearFilters}
      >
        Clear filters
      </button>
    </>
  )
}

export function MobileFilterHeader(props: {
  children: string
  className?: string
}) {
  const { children: text, className } = props
  return (
    <div className={clsx('text-ink-600 inline-block', className)}>{text}</div>
  )
}
