import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { MdOutlineStroller } from 'react-icons/md'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { AgeFilter } from './age-filter'
import { GenderFilter } from './gender-filter'
import { HasKidsFilter } from './has-kids-filter'
import { LocationFilter, LocationFilterProps } from './location-filter'
import { PrefGenderFilter } from './pref-gender-filter'
import { RelationshipFilter } from './relationship-filter'
import { FilterFields } from './search'
import { WantsKidsFilter } from './wants-kids-filter'
import { FaChild } from 'react-icons/fa6'
import { MyMatchesToggle } from './my-matches-toggle'
import { Lover } from 'common/love/lover'

export function MobileFilters(props: {
  filters: Partial<FilterFields>
  youLover: Lover | undefined | null
  updateFilter: (newState: Partial<FilterFields>) => void
  clearFilters: () => void
  setYourFilters: (checked: boolean) => void
  isYourFilters: boolean
  locationFilterProps: LocationFilterProps
}) {
  const {
    filters,
    youLover,
    updateFilter,
    clearFilters,
    setYourFilters,
    isYourFilters,
    locationFilterProps,
  } = props

  const [openFilter, setOpenFilter] = useState<string | undefined>(undefined)

  return (
    <Col>
      <Col className="p-4 pb-2">
        <MyMatchesToggle
          setYourFilters={setYourFilters}
          youLover={youLover}
          isYourFilters={isYourFilters}
          hidden={!youLover}
        />
      </Col>
      {/* GENDER */}
      <MobileFilterSection
        title="Gender"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
      >
        <GenderFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* PREFERRED GENDER */}
      <MobileFilterSection
        title="Interested in"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
      >
        <PrefGenderFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* AGE RANGE */}
      <MobileFilterSection
        title="Age"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        childrenClassName={'pb-6'}
      >
        <AgeFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* LOCATION */}
      <MobileFilterSection
        title="Location"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
      >
        <LocationFilter
          youLover={youLover}
          locationFilterProps={locationFilterProps}
        />
      </MobileFilterSection>
      {/* RELATIONSHIP STYLE */}
      <MobileFilterSection
        title="Relationship style"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
      >
        <RelationshipFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* WANTS KIDS */}
      <MobileFilterSection
        title="Wants kids"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        icon={<MdOutlineStroller className="text-ink-400 h-4 w-4" />}
      >
        <WantsKidsFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* HAS KIDS */}
      <MobileFilterSection
        title="Has kids"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        icon={<FaChild className="text-ink-400 h-4 w-4" />}
      >
        <HasKidsFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      <button
        className="text-ink-500 hover:text-primary-500 underline"
        onClick={clearFilters}
      >
        Clear filters
      </button>
    </Col>
  )
}

export function MobileFilterSection(props: {
  title: string
  children: ReactNode
  openFilter: string | undefined
  setOpenFilter: (openFilter: string | undefined) => void
  className?: string
  childrenClassName?: string
  icon?: ReactNode
  selection?: ReactNode
}) {
  const {
    title,
    children,
    openFilter,
    setOpenFilter,
    className,
    childrenClassName,
    icon,
    selection,
  } = props
  const isOpen = openFilter == title
  return (
    <Col className={clsx(className)}>
      <button
        className={clsx(
          'text-ink-600 flex w-full flex-row justify-between px-4 pt-4',
          isOpen ? 'pb-2' : 'pb-4'
        )}
        onClick={() =>
          isOpen ? setOpenFilter(undefined) : setOpenFilter(title)
        }
      >
        <Row className="items-center gap-0.5">
          {icon}
          {title}
          {selection}
        </Row>
        <div className="text-ink-400">
          {isOpen ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className={clsx('bg-canvas-50 px-4 py-2', childrenClassName)}>
          {children}
        </div>
      )}
    </Col>
  )
}
