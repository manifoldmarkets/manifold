import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { MdOutlineStroller } from 'react-icons/md'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { AgeFilter, AgeFilterText, getNoMinMaxAge } from './age-filter'
import { GenderFilter, GenderFilterText } from './gender-filter'
import { HasKidsFilter, HasKidsLabel, hasKidsLabels } from './has-kids-filter'
import {
  LocationFilter,
  LocationFilterProps,
  LocationFilterText,
  PREF_AGE_MIN,
  PREF_AGE_MAX,
} from './location-filter'
import { PrefGenderFilter, PrefGenderFilterText } from './pref-gender-filter'
import {
  RelationshipFilter,
  RelationshipFilterText,
} from './relationship-filter'
import { FilterFields } from './search'
import {
  KidsLabel,
  WantsKidsFilter,
  WantsKidsIcon,
  wantsKidsLabels,
} from './wants-kids-filter'
import { FaChild } from 'react-icons/fa6'
import { MyMatchesToggle } from './my-matches-toggle'
import { Lover } from 'common/love/lover'
import { Gender } from '../gender-icon'
import { RelationshipType } from 'love/lib/util/convert-relationship-type'

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
  function isAny(filterArray: any[] | undefined) {
    return !filterArray || filterArray.length < 0
  }

  const [noMinAge, noMaxAge] = getNoMinMaxAge(
    filters.pref_age_min,
    filters.pref_age_max
  )

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
        selection={
          <GenderFilterText
            gender={filters.genders as Gender[]}
            highlightedClass={
              isAny(filters.genders) ? 'text-ink-400' : 'text-primary-600'
            }
          />
        }
      >
        <GenderFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* PREFERRED GENDER */}
      <MobileFilterSection
        title="Interested in"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        selection={
          <PrefGenderFilterText
            pref_gender={filters.pref_gender as Gender[]}
            highlightedClass={
              isAny(filters.pref_gender) ? 'text-ink-400' : 'text-primary-600'
            }
          />
        }
      >
        <PrefGenderFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* AGE RANGE */}
      <MobileFilterSection
        title="Age"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        childrenClassName={'pb-6'}
        selection={
          <AgeFilterText
            pref_age_min={filters.pref_age_min}
            pref_age_max={filters.pref_age_max}
            highlightedClass={
              noMinAge && noMaxAge ? 'text-ink-400' : 'text-primary-600'
            }
          />
        }
      >
        <AgeFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* LOCATION */}
      <MobileFilterSection
        title="Location"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        selection={
          <LocationFilterText
            nearbyOriginLocation={locationFilterProps.nearbyOriginLocation}
            radius={locationFilterProps.radius}
            youLover={youLover}
            highlightedClass={
              !locationFilterProps.nearbyOriginLocation
                ? 'text-ink-400'
                : 'text-primary-600'
            }
          />
        }
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
        selection={
          <RelationshipFilterText
            relationship={filters.pref_relation_styles as RelationshipType[]}
            highlightedClass={
              isAny(filters.pref_relation_styles)
                ? 'text-ink-400'
                : 'text-primary-600'
            }
          />
        }
      >
        <RelationshipFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* WANTS KIDS */}
      <MobileFilterSection
        title="Wants kids"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        icon={<WantsKidsIcon strength={filters.wants_kids_strength ?? -1} />}
        selection={
          <KidsLabel
            strength={filters.wants_kids_strength ?? -1}
            highlightedClass={
              (filters.wants_kids_strength ?? -1) ==
              wantsKidsLabels.no_preference.strength
                ? 'text-ink-400'
                : 'text-primary-600'
            }
            mobile
          />
        }
      >
        <WantsKidsFilter filters={filters} updateFilter={updateFilter} />
      </MobileFilterSection>
      {/* HAS KIDS */}
      <MobileFilterSection
        title="Has kids"
        openFilter={openFilter}
        setOpenFilter={setOpenFilter}
        icon={<FaChild className="text-ink-400 h-4 w-4" />}
        selection={
          <HasKidsLabel
            has_kids={filters.has_kids ?? -1}
            highlightedClass={
              (filters.has_kids ?? -1) == hasKidsLabels.no_preference.value
                ? 'text-ink-400'
                : 'text-primary-600'
            }
            mobile
          />
        }
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
          {title}: {selection}
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
