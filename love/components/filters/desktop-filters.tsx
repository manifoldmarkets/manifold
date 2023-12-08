import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { RelationshipType } from 'love/lib/util/convert-relationship-type'
import { ReactNode } from 'react'
import { FaUserGroup } from 'react-icons/fa6'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CustomizeableDropdown } from 'web/components/widgets/customizeable-dropdown'
import { Gender } from '../gender-icon'
import { AgeFilter, AgeFilterText } from './age-filter'
import { GenderFilter, GenderFilterText } from './gender-filter'
import {
  LocationFilter,
  LocationFilterProps,
  LocationFilterText,
} from './location-filter'
import { PrefGenderFilter, PrefGenderFilterText } from './pref-gender-filter'
import {
  RelationshipFilter,
  RelationshipFilterText,
} from './relationship-filter'
import { FilterFields } from './search'
import { KidsLabel, wantsKidsLabels } from './wants-kids-filter'
import { HasKidsLabel, hasKidsLabels } from './has-kids-filter'
import { MyMatchesToggle } from './my-matches-toggle'
import { Lover } from 'common/love/lover'

export function DesktopFilters(props: {
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

  return (
    <>
      <MyMatchesToggle
        setYourFilters={setYourFilters}
        youLover={youLover}
        on={isYourFilters}
        hidden={!youLover}
      />
      <CustomizeableDropdown
        buttonContent={(open: boolean) => (
          <DropdownButton
            content={
              <GenderFilterText
                gender={filters.genders as Gender[]}
                highlightedClass={open ? 'text-primary-500' : undefined}
              />
            }
            open={open}
          />
        )}
        dropdownMenuContent={
          <Col>
            <GenderFilter filters={filters} updateFilter={updateFilter} />
          </Col>
        }
        popoverClassName="bg-canvas-50"
      />
      {/* PREFERRED GENDER */}
      <CustomizeableDropdown
        buttonContent={(open: boolean) => (
          <DropdownButton
            content={
              <PrefGenderFilterText
                pref_gender={filters.pref_gender as Gender[]}
                highlightedClass={open ? 'text-primary-500' : undefined}
              />
            }
            open={open}
          />
        )}
        dropdownMenuContent={
          <Col>
            <PrefGenderFilter filters={filters} updateFilter={updateFilter} />
          </Col>
        }
        popoverClassName="bg-canvas-50"
      />
      {/* AGE RANGE */}
      <CustomizeableDropdown
        buttonContent={(open: boolean) => (
          <DropdownButton
            open={open}
            content={
              <AgeFilterText
                pref_age_min={filters.pref_age_min}
                pref_age_max={filters.pref_age_max}
                highlightedClass={open ? 'text-primary-500' : ''}
              />
            }
          />
        )}
        dropdownMenuContent={
          <Col className="mx-2 mb-4">
            <AgeFilter filters={filters} updateFilter={updateFilter} />
          </Col>
        }
        popoverClassName="bg-canvas-50"
        menuWidth="w-80"
      />
      {/* LOCATION */}
      <CustomizeableDropdown
        buttonContent={(open: boolean) => (
          <DropdownButton
            content={
              <LocationFilterText
                youLover={youLover}
                nearbyOriginLocation={locationFilterProps.nearbyOriginLocation}
                radius={locationFilterProps.radius}
                highlightedClass={open ? 'text-primary-500' : ''}
              />
            }
            open={open}
          />
        )}
        dropdownMenuContent={
          <LocationFilter
            youLover={youLover}
            locationFilterProps={locationFilterProps}
          />
        }
        popoverClassName="bg-canvas-50"
        menuWidth="w-80"
      />
      <CustomizeableDropdown
        buttonContent={(open) => (
          <DropdownButton
            open={open}
            content={
              <Row className="items-center gap-1">
                <FaUserGroup className="h-4 w-4" />
                <RelationshipFilterText
                  relationship={
                    filters.pref_relation_styles as
                      | RelationshipType[]
                      | undefined
                  }
                  highlightedClass={open ? 'text-primary-500' : undefined}
                />
              </Row>
            }
          />
        )}
        dropdownMenuContent={
          <RelationshipFilter filters={filters} updateFilter={updateFilter} />
        }
        popoverClassName="bg-canvas-50"
      />
      {/* WANTS KIDS */}
      <DropdownMenu
        items={[
          {
            name: wantsKidsLabels.no_preference.name,
            icon: wantsKidsLabels.no_preference.icon,
            onClick: () => {
              updateFilter({
                wants_kids_strength: wantsKidsLabels.no_preference.strength,
              })
            },
          },
          {
            name: wantsKidsLabels.wants_kids.name,
            icon: wantsKidsLabels.wants_kids.icon,
            onClick: () => {
              updateFilter({
                wants_kids_strength: wantsKidsLabels.wants_kids.strength,
              })
            },
          },
          {
            name: wantsKidsLabels.doesnt_want_kids.name,
            icon: wantsKidsLabels.doesnt_want_kids.icon,
            onClick: () => {
              updateFilter({
                wants_kids_strength: wantsKidsLabels.doesnt_want_kids.strength,
              })
            },
          },
        ]}
        closeOnClick
        buttonClass={'!text-ink-600 !hover:!text-ink-600'}
        buttonContent={(open: boolean) => (
          <DropdownButton
            content={
              <KidsLabel
                strength={
                  filters.wants_kids_strength ??
                  wantsKidsLabels.no_preference.strength
                }
                highlightedClass={open ? 'text-primary-500' : ''}
              />
            }
            open={open}
          />
        )}
        menuItemsClass={'bg-canvas-50'}
        menuWidth="w-48"
      />
      {/* HAS KIDS */}
      <DropdownMenu
        items={[
          {
            name: hasKidsLabels.no_preference.name,
            onClick: () => {
              updateFilter({ has_kids: hasKidsLabels.no_preference.value })
            },
          },
          {
            name: hasKidsLabels.doesnt_have_kids.name,
            onClick: () => {
              updateFilter({ has_kids: hasKidsLabels.doesnt_have_kids.value })
            },
          },
          {
            name: hasKidsLabels.has_kids.name,
            onClick: () => {
              updateFilter({ has_kids: hasKidsLabels.has_kids.value })
            },
          },
        ]}
        closeOnClick
        buttonClass={'!text-ink-600 !hover:!text-ink-600'}
        buttonContent={(open: boolean) => (
          <DropdownButton
            content={
              <HasKidsLabel
                has_kids={filters.has_kids ?? -1}
                highlightedClass={open ? 'text-primary-500' : ''}
              />
            }
            open={open}
          />
        )}
        menuItemsClass="bg-canvas-50"
        menuWidth="w-40"
      />
      <button
        className="text-ink-500 hover:text-primary-500 underline"
        onClick={clearFilters}
      >
        Clear filters
      </button>
    </>
  )
}

export function DropdownButton(props: { open: boolean; content: ReactNode }) {
  const { open, content } = props
  return (
    <Row className="hover:text-ink-700 items-center gap-0.5 transition-all">
      {content}
      <span className="text-ink-400">
        {open ? (
          <ChevronUpIcon className="h-4 w-4" />
        ) : (
          <ChevronDownIcon className="h-4 w-4" />
        )}
      </span>
    </Row>
  )
}
