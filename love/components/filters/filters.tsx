import { debounce, orderBy } from 'lodash'
import { ReactNode, useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { Row as rowFor } from 'common/supabase/utils'
import { Checkbox } from 'web/components/widgets/checkbox'
import clsx from 'clsx'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { Lover } from 'love/hooks/use-lover'
import { calculateAge } from 'love/components/calculate-age'
import { User } from 'common/user'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { searchNearCity } from 'web/lib/firebase/api'
import { useIsAuthorized } from 'web/hooks/use-user'
import { useNearbyCities } from 'love/hooks/use-nearby-locations'
import { RangeSlider, Slider } from 'web/components/widgets/slider'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { Select } from 'web/components/widgets/select'
import { Popover, Transition } from '@headlessui/react'
import React from 'react'
import { CustomizeableDropdown } from 'web/components/widgets/customizeable-dropdown'
import { Title } from 'web/components/widgets/title'
import { AgeFilterText, PREF_AGE_MAX, PREF_AGE_MIN } from './age-filter-text'
import { LocationFilterText } from './location-filter-text'
import { PrefGenderFilterText } from './pref-gender-filter-text'
import { Gender } from '../gender-icon'
import { RelationshipFilterText } from './relationship-filter-text'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import {
  DOESNT_WANT_KIDS_STRENGTH,
  KidsLabel,
  NO_PREFERENCE_STRENGTH,
  WANTS_KIDS_STRENGTH,
  kidsLabels,
} from './kids-labels'
import { GenderFilterText } from './gender-filter-text'
import { RelationshipType } from 'love/lib/util/convert-relationship-type'
import { FaChild, FaUserGroup } from 'react-icons/fa6'

type FilterFields = {
  orderBy: 'last_online_time' | 'created_time'
  geodbCityIds: string[]
  genders: string[]
} & rowFor<'lovers'> &
  User

function isOrderBy(input: string): input is FilterFields['orderBy'] {
  return ['last_online_time', 'created_time'].includes(input)
}

const labelClassName = 'font-semibold'
const initialFilters: Partial<FilterFields> = {
  geodbCityIds: undefined,
  name: undefined,
  genders: undefined,
  pref_age_max: undefined,
  pref_age_min: undefined,
  has_kids: undefined,
  wants_kids_strength: -1,
  is_smoker: undefined,
  pref_relation_styles: undefined,
  pref_gender: undefined,
  orderBy: 'created_time',
}
export const Filters = (props: {
  allLovers: Lover[] | undefined
  setLovers: (lovers: Lover[] | undefined) => void
  youLover: Lover | undefined | null
}) => {
  const { allLovers, setLovers, youLover } = props
  const [filters, setFilters] = usePersistentInMemoryState<
    Partial<FilterFields>
  >(initialFilters, 'profile-filters')

  const [nearbyOriginLocation, setNearbyOriginLocation] = useState<
    string | null | undefined
  >(undefined)

  const [radius, setRadius] = useState<number>(100)

  const [debouncedRadius, setDebouncedRadius] = useState(radius)
  const [debouncedSetRadius] = useState(() => debounce(setDebouncedRadius, 200))

  useEffect(() => {
    debouncedSetRadius(radius)
  }, [radius])

  useEffect(() => {
    if (youLover) {
      setNearbyOriginLocation(youLover.geodb_city_id)
    }
  }, [youLover])

  const nearbyCities = useNearbyCities(nearbyOriginLocation, debouncedRadius)

  const updateFilter = (newState: Partial<FilterFields>) => {
    setFilters((prevState) => ({ ...prevState, ...newState }))
  }
  const clearFilters = () => {
    setFilters(initialFilters)
    setLovers(allLovers)
  }
  useEffect(() => {
    if (allLovers) {
      applyFilters()
    }
  }, [
    JSON.stringify(filters),
    allLovers?.map((l) => l.id).join(','),
    debouncedRadius,
  ])

  const applyFilters = () => {
    const sortedLovers = orderBy(
      allLovers,
      (lover) => {
        switch (filters.orderBy) {
          case 'last_online_time':
            return (
              (lover.pinned_url ? 2 : 1) *
              new Date(lover.last_online_time).getTime()
            )
          case 'created_time':
            return new Date(lover.created_time).getTime()
        }
      },
      'desc'
    )
    const filteredLovers = sortedLovers?.filter((lover) => {
      if (lover.user.name === 'deleted') return false
      if (
        filters.pref_age_min &&
        calculateAge(lover.birthdate) < filters.pref_age_min
      ) {
        return false
      } else if (
        filters.pref_age_max &&
        calculateAge(lover.birthdate) > filters.pref_age_max
      ) {
        return false
      } else if (calculateAge(lover.birthdate) < 18) {
        return false
      } else if (
        filters.geodbCityIds &&
        (!lover.geodb_city_id ||
          !(filters.geodbCityIds ?? []).includes(lover.geodb_city_id))
      ) {
        return false
      } else if (
        filters.is_smoker !== undefined &&
        lover.is_smoker !== filters.is_smoker
      ) {
        return false
      } else if (
        filters.wants_kids_strength !== undefined &&
        filters.wants_kids_strength !== -1 &&
        (filters.wants_kids_strength >= 2
          ? lover.wants_kids_strength < filters.wants_kids_strength
          : lover.wants_kids_strength > filters.wants_kids_strength)
      ) {
        return false
      } else if (
        filters.has_kids !== undefined &&
        filters.has_kids !== null &&
        ((filters.has_kids == 0 && lover.has_kids && lover.has_kids > 0) ||
          (filters.has_kids == 1 && (!lover.has_kids || lover.has_kids < 1)))
      ) {
        return false
      } else if (
        filters.pref_relation_styles !== undefined &&
        filters.pref_relation_styles.every(
          (s) => !lover.pref_relation_styles.includes(s)
        ) // if every relationship style mismatches, hide person
      ) {
        return false
      } else if (
        filters.name &&
        !lover.user.name.toLowerCase().includes(filters.name.toLowerCase())
      ) {
        return false
      } else if (
        filters.genders !== undefined &&
        filters.genders.length > 0 &&
        !filters.genders.includes(lover.gender)
      ) {
        return false
      } else if (
        filters.pref_gender !== undefined &&
        filters.pref_gender.length > 0 &&
        filters.pref_gender.every((g) => !lover.pref_gender.includes(g))
        // if every preferred gender mismatches, hide person
      ) {
        return false
      } else if (!lover.pinned_url) return false
      return true
    })
    setLovers(filteredLovers)
  }

  console.log(filters.has_kids)
  const rowClassName = 'gap-2 items-start'
  return (
    <Row className="bg-canvas-0 text-ink-600 w-full gap-2 py-2 text-sm">
      <Col className={'w-full'}>
        <Row className={'mb-2 justify-between gap-2'}>
          <Input
            placeholder={'Search name'}
            className={'w-full max-w-xs'}
            onChange={(e) => updateFilter({ name: e.target.value })}
          />

          <Row className="gap-2">
            <Select
              onChange={(e) => {
                if (isOrderBy(e.target.value)) {
                  updateFilter({
                    orderBy: e.target.value,
                  })
                }
              }}
              value={filters.orderBy || 'created_time'}
              className={'w-18 border-ink-300 rounded-md'}
            >
              <option value="last_online_time">Active</option>
              <option value="created_time">New</option>
            </Select>
          </Row>
        </Row>
        <Row
          className={'border-ink-300 dark:border-ink-300 flex-wrap gap-2 pt-2'}
        >
          {/* PREFERRED GENDER */}
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
                <MultiCheckbox
                  selected={filters.genders ?? []}
                  choices={
                    {
                      Male: 'male',
                      Female: 'female',
                      'Non-binary': 'non-binary',
                      'Trans-female': 'trans-female',
                      'Trans-male': 'trans-male',
                    } as any
                  }
                  onChange={(c) => {
                    updateFilter({ genders: c })
                  }}
                />
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
                <MultiCheckbox
                  selected={filters.pref_gender ?? []}
                  choices={
                    {
                      Male: 'male',
                      Female: 'female',
                      'Non-binary': 'non-binary',
                      'Trans-female': 'trans-female',
                      'Trans-male': 'trans-male',
                    } as any
                  }
                  onChange={(c) => {
                    updateFilter({ pref_gender: c })
                  }}
                />
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
                      value:
                        ((30 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) *
                        100,
                      label: `30`,
                    },
                    {
                      value:
                        ((50 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) *
                        100,
                      label: `50`,
                    },
                    {
                      value:
                        ((70 - PREF_AGE_MIN) / (PREF_AGE_MAX - PREF_AGE_MIN)) *
                        100,
                      label: `70`,
                    },
                    { value: 100, label: `${PREF_AGE_MAX}` },
                  ]}
                />
              </Col>
            }
            popoverClassName="bg-canvas-50"
            menuWidth="w-80"
          />
          {/* LOCATION */}
          {youLover && nearbyOriginLocation && (
            <CustomizeableDropdown
              buttonContent={(open: boolean) => (
                <DropdownButton
                  content={
                    <LocationFilterText
                      locationFilterOn={!!filters.geodbCityIds}
                      radius={radius}
                      highlightedClass={open ? 'text-primary-500' : ''}
                    />
                  }
                  open={open}
                />
              )}
              dropdownMenuContent={
                <Col className={clsx('w-full', rowClassName)}>
                  <Checkbox
                    label={`Near you`}
                    checked={!!filters.geodbCityIds}
                    toggle={(checked: boolean) => {
                      if (checked) {
                        updateFilter({
                          geodbCityIds: [
                            nearbyOriginLocation,
                            ...(nearbyCities || []),
                          ],
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
              }
              popoverClassName="bg-canvas-50"
              menuWidth="w-80"
            />
          )}
          <DropdownMenu
            items={[
              {
                name: kidsLabels.no_preference.name,
                icon: kidsLabels.no_preference.icon,
                onClick: () => {
                  updateFilter({
                    wants_kids_strength: NO_PREFERENCE_STRENGTH,
                  })
                },
              },
              {
                name: kidsLabels.wants_kids.name,
                icon: kidsLabels.wants_kids.icon,
                onClick: () => {
                  updateFilter({ wants_kids_strength: WANTS_KIDS_STRENGTH })
                },
              },
              {
                name: kidsLabels.doesnt_want_kids.name,
                icon: kidsLabels.doesnt_want_kids.icon,
                onClick: () => {
                  updateFilter({
                    wants_kids_strength: DOESNT_WANT_KIDS_STRENGTH,
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
                      filters.wants_kids_strength ?? NO_PREFERENCE_STRENGTH
                    }
                  />
                }
                open={open}
              />
            )}
            menuItemsClass="bg-canvas-50"
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
              <MultiCheckbox
                selected={filters.pref_relation_styles ?? []}
                choices={
                  {
                    Monogamous: 'mono',
                    Polyamorous: 'poly',
                    'Open Relationship': 'open',
                    Other: 'other',
                  } as any
                }
                onChange={(c) => {
                  updateFilter({ pref_relation_styles: c })
                }}
              />
            }
            popoverClassName="bg-canvas-50"
          />
          <DropdownMenu
            items={[
              {
                name: 'Any',
                onClick: () => {
                  updateFilter({ has_kids: undefined })
                },
              },
              {
                name: `Doesn't have kids`,
                onClick: () => {
                  updateFilter({ has_kids: 0 })
                },
              },
              {
                name: 'Has kids',
                onClick: () => {
                  updateFilter({ has_kids: 1 })
                },
              },
            ]}
            closeOnClick
            buttonClass={'!text-ink-600 !hover:!text-ink-600'}
            buttonContent={(open: boolean) => (
              <DropdownButton
                content={
                  <Row className="items-center gap-0.5">
                    <FaChild className="h-4 w-4" />
                    {!filters.has_kids
                      ? 'Any'
                      : filters.has_kids == 0
                      ? `Doesn't have kids`
                      : 'Has kids'}
                  </Row>
                }
                open={open}
              />
            )}
            menuItemsClass="bg-canvas-50"
            menuWidth="w-40"
          />
          {/* <Row className={'mt-2 gap-2'}>
            <Row className={clsx(rowClassName)}>
              <Checkbox
                label={'Has kids'}
                checked={!!filters.has_kids}
                toggle={(checked) =>
                  updateFilter({ has_kids: checked ? 1 : 0 })
                }
              />
            </Row>
          </Row> */}
          <Button color={'gray-white'} onClick={clearFilters} size="xs">
            Clear filters
          </Button>
        </Row>
      </Col>
    </Row>
  )
}

function DropdownButton(props: { open: boolean; content: ReactNode }) {
  const { open, content } = props
  return (
    <Row className="items-center gap-0.5">
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
