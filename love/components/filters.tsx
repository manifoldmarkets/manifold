import { orderBy } from 'lodash'
import { useEffect, useState } from 'react'
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
import { Select } from 'web/components/widgets/select'

type FilterFields = {
  orderBy: 'last_online_time' | 'created_time'
} & rowFor<'lovers'> &
  User

function isOrderBy(input: string): input is FilterFields['orderBy'] {
  return ['last_online_time', 'created_time'].includes(input)
}

const labelClassName = 'font-semibold'
const initialFilters: Partial<FilterFields> = {
  name: undefined,
  gender: undefined,
  pref_age_max: undefined,
  pref_age_min: undefined,
  city: undefined,
  has_kids: undefined,
  wants_kids_strength: -1,
  is_smoker: undefined,
  pref_relation_styles: undefined,
  pref_gender: undefined,
  orderBy: 'last_online_time',
}
export const Filters = (props: {
  allLovers: Lover[] | undefined
  setLovers: (lovers: Lover[] | undefined) => void
}) => {
  const { allLovers, setLovers } = props
  const [filters, setFilters] = usePersistentInMemoryState<
    Partial<FilterFields>
  >(initialFilters, 'profile-filters')

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
  }, [JSON.stringify(filters), allLovers?.map((l) => l.id).join(',')])

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
      } else if (filters.city && lover.city !== filters.city) {
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
        (lover.has_kids ?? 0) < filters.has_kids
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
      } else if (filters.gender && lover.gender !== filters.gender) {
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
    console.log(filteredLovers)
  }
  const cities: { [key: string]: string } = {
    All: '',
    'San Francisco': 'San Francisco',
    'New York City': 'New York City',
    London: 'London',
  }
  const [showFilters, setShowFilters] = useState(false)

  const rowClassName = 'gap-2 items-start'
  return (
    <Row className="bg-canvas-0 w-full gap-2 py-2">
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
              value={filters.orderBy || 'last_online_time'}
              className={'w-18 border-ink-300 rounded-md'}
            >
              <option value="last_online_time">Recently Active</option>
              <option value="created_time">Newly Registered</option>
            </Select>

            <Button
              color={'gray-outline'}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? (
                <ChevronUpIcon className={'mr-2 h-4 w-4'} />
              ) : (
                <ChevronDownIcon className={'mr-2 h-4 w-4'} />
              )}
              {showFilters ? 'Filters' : 'Filters'}
            </Button>
          </Row>
        </Row>
        {showFilters && (
          <>
            <Row
              className={
                'border-ink-300 dark:border-ink-300 grid grid-cols-1 gap-4 rounded-md border p-4 md:grid-cols-2'
              }
            >
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Gender</label>
                <select
                  className={
                    'bg-canvas-0 text-ink-1000 border-ink-300 focus:border-primary-500 focus:ring-primary-500 w-full rounded-md sm:w-3/4'
                  }
                  onChange={(e) =>
                    updateFilter({
                      gender: e.target.value,
                    })
                  }
                  value={filters.gender}
                >
                  <option value="">All</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="trans-female">Trans Female</option>
                  <option value="trans-male">Trans Male</option>
                  <option value="non-binary">Non-Binary</option>
                </select>
              </Col>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>
                  Gender person is interested in
                </label>
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

              <Row className="gap-4 sm:pr-8">
                <Col className={clsx(rowClassName, 'grow')}>
                  <label className={clsx(labelClassName)}>Min age</label>
                  <Input
                    type="number"
                    className={'w-full'}
                    value={filters.pref_age_min}
                    onChange={(e) =>
                      updateFilter({ pref_age_min: Number(e.target.value) })
                    }
                  />
                </Col>

                <Col className={clsx(rowClassName, 'grow')}>
                  <label className={clsx(labelClassName)}>Max age</label>
                  <Input
                    type="number"
                    value={filters.pref_age_max}
                    className={'w-full'}
                    onChange={(e) =>
                      updateFilter({ pref_age_max: Number(e.target.value) })
                    }
                  />
                </Col>
              </Row>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>City</label>
                <ChoicesToggleGroup
                  currentChoice={filters.city ?? ''}
                  choicesMap={cities}
                  setChoice={(c) => updateFilter({ city: c as string })}
                />
              </Col>

              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Wants kids</label>
                <ChoicesToggleGroup
                  currentChoice={filters.wants_kids_strength ?? 0}
                  choicesMap={{
                    Any: -1,
                    Yes: 2,
                    No: 0,
                  }}
                  setChoice={(c) =>
                    updateFilter({ wants_kids_strength: Number(c) })
                  }
                  toggleClassName="min-w-[80px] justify-center"
                />
              </Col>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>
                  Relationship style
                </label>
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
              </Col>

              <Col>
                <label className={clsx(labelClassName)}>Other</label>
                <Row className={'mt-2 gap-2'}>
                  <Row className={clsx(rowClassName)}>
                    <Checkbox
                      label={'Has kids'}
                      checked={!!filters.has_kids}
                      toggle={(checked) =>
                        updateFilter({ has_kids: checked ? 1 : 0 })
                      }
                    />
                  </Row>
                </Row>
              </Col>
            </Row>
            <Row className={'justify-end gap-4'}>
              <Button color={'gray-white'} onClick={clearFilters}>
                Clear filters
              </Button>
            </Row>
          </>
        )}
      </Col>
    </Row>
  )
}
