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
import { ReactNode, forwardRef, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'

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

  const [openFilter, setOpenFilter] = useState<string | undefined>(undefined)

  return (
    <>
      <MobileFilterSection
        title="Gender"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
      >
        <GenderFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
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
      {/* RELATIONSHIP STYLE */}
      <Col>
        <Subtitle>Relationship Style</Subtitle>
        <RelationshipFilter filters={filters} updateFilter={updateFilter} />
      </Col>
      {/* WANTS KIDS */}
      <Col>
        <Subtitle>Wants kids</Subtitle>
        <WantsKidsFilter filters={filters} updateFilter={updateFilter} />
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

export function MobileFilterSection(props: {
  title: string
  children: ReactNode
  openFilter: string | undefined
  setOpenFilter: (openFilter: string | undefined) => void
  className?: string
}) {
  const { title, children, openFilter, setOpenFilter, className } = props
  const isOpen = openFilter == title
  return (
    <Col className={clsx(className)}>
      <button
        className="text-ink-600 flex w-full flex-row justify-between px-4 py-1"
        onClick={() =>
          isOpen ? setOpenFilter(undefined) : setOpenFilter(title)
        }
      >
        {title}
        <div className="text-ink-400">
          {isOpen ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </div>
      </button>
      {isOpen && <div className="bg-canvas-50 px-4 py-2">{children}</div>}
    </Col>
  )
}
