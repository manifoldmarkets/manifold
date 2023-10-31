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
import { searchNearCity } from 'web/lib/firebase/api'
import { useIsAuthorized } from 'web/hooks/use-user'
import { useNearbyCities } from 'love/hooks/use-nearby-locations'

const labelClassName = 'font-semibold'
const initialFilters = {
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
}
export const Filters = (props: {
  allLovers: Lover[] | undefined
  setLovers: (lovers: Lover[] | undefined) => void
  youLover: Lover | undefined | null
}) => {
  const { allLovers, setLovers, youLover } = props
  const [filters, setFilters] = usePersistentInMemoryState<
    Partial<rowFor<'lovers'> & User>
  >(initialFilters, 'profile-filters')

  const [nearbyOriginLocation, setNearbyOriginLocation] = useState<
    string | null | undefined
  >(undefined)

  const [proximity, setProximity] = useState<number>(100)

  useEffect(() => {
    if (youLover) {
      console.log('YOU LOVER', youLover)
      setNearbyOriginLocation(youLover.geodb_city_id)
    }
  }, [youLover])

  const nearbyCities = useNearbyCities(nearbyOriginLocation)

  const updateFilter = (newState: Partial<rowFor<'lovers'> & User>) => {
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
      (lover) =>
        (lover.pinned_url ? 2 : 1) * new Date(lover.last_online_time).getTime(),
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
    // console.log(filteredLovers)
  }
  const cities: { [key: string]: string } = {
    'San Francisco': 'San Francisco',
    'New York City': 'New York City',
    London: 'London',
    All: '',
  }
  const [showFilters, setShowFilters] = useState(false)

  const rowClassName = 'gap-2'
  return (
    <Row className="bg-canvas-0 w-full gap-2 p-2">
      <Col className={'w-full'}>
        <Row className={'mb-2 justify-between gap-2'}>
          <Input
            placeholder={'Search name'}
            className={'w-full max-w-xs'}
            onChange={(e) => updateFilter({ name: e.target.value })}
          />
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
        {showFilters && (
          <>
            <Row className={'flex-wrap gap-4'}>
              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Gender</label>
                <select
                  className={
                    'bg-canvas-0 text-ink-1000 border-ink-300 focus:border-primary-500 focus:ring-primary-500 rounded-md '
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

              <Row className="gap-4">
                <Col className={clsx(rowClassName)}>
                  <label className={clsx(labelClassName)}>Min age</label>
                  <Input
                    type="number"
                    className={'w-20'}
                    value={filters.pref_age_min}
                    onChange={(e) =>
                      updateFilter({ pref_age_min: Number(e.target.value) })
                    }
                  />
                </Col>

                <Col className={clsx(rowClassName)}>
                  <label className={clsx(labelClassName)}>Max age</label>
                  <Input
                    type="number"
                    value={filters.pref_age_max}
                    className={'w-20'}
                    onChange={(e) =>
                      updateFilter({ pref_age_max: Number(e.target.value) })
                    }
                  />
                </Col>
              </Row>
              {youLover && nearbyOriginLocation && (
                <Col className={clsx(rowClassName)}>
                  <label className={clsx(labelClassName)}>Location</label>
                  <ChoicesToggleGroup
                    currentChoice={filters.city ?? ''}
                    choicesMap={cities}
                    setChoice={(c) => updateFilter({ city: c as string })}
                  />
                </Col>
              )}

              <Col className={clsx(rowClassName)}>
                <label className={clsx(labelClassName)}>Wants kids</label>
                <ChoicesToggleGroup
                  currentChoice={filters.wants_kids_strength ?? 0}
                  choicesMap={{
                    Yes: 2,
                    No: 0,
                    Any: -1,
                  }}
                  setChoice={(c) =>
                    updateFilter({ wants_kids_strength: Number(c) })
                  }
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
            </Row>
            <Row className={'mt-2'}>
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
