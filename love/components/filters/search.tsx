import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { debounce, orderBy } from 'lodash'
import { calculateAge } from 'love/components/calculate-age'
import { Lover } from 'love/hooks/use-lover'
import { useNearbyCities } from 'love/hooks/use-nearby-locations'
import { useEffect, useState } from 'react'
import { IoFilterSharp } from 'react-icons/io5'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { RightModal } from 'web/components/layout/right-modal'
import { Row } from 'web/components/layout/row'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Input } from 'web/components/widgets/input'
import { Select } from 'web/components/widgets/select'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { DesktopFilters } from './desktop-filters'
import { MobileFilters } from './mobile-filters'
import {
  wantsKidsDatabase,
  wantsKidsDatabaseToWantsKidsFilter,
  wantsKidsToHasKidsFilter,
} from './wants-kids-filter'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'

export type FilterFields = {
  orderBy: 'last_online_time' | 'created_time'
  geodbCityIds: string[]
  genders: string[]
} & rowFor<'lovers'> &
  User

function isOrderBy(input: string): input is FilterFields['orderBy'] {
  return ['last_online_time', 'created_time'].includes(input)
}

const initialFilters: Partial<FilterFields> = {
  geodbCityIds: undefined,
  name: undefined,
  genders: undefined,
  pref_age_max: undefined,
  pref_age_min: undefined,
  has_kids: -1,
  wants_kids_strength: -1,
  is_smoker: undefined,
  pref_relation_styles: undefined,
  pref_gender: undefined,
  orderBy: 'created_time',
}
export const Search = (props: {
  allLovers: Lover[] | undefined
  setLovers: (lovers: Lover[] | undefined) => void
  youLover: Lover | undefined | null
}) => {
  const { allLovers, setLovers, youLover } = props
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

  const setYourFilters = (checked: boolean) => {
    if (checked) {
      updateFilter(yourFilters)
    } else {
      clearFilters()
    }
  }

  const [radius, setRadius] = useState<number>(100)

  const [debouncedRadius, setDebouncedRadius] = useState(radius)
  const [debouncedSetRadius] = useState(() => debounce(setDebouncedRadius, 200))

  const [nearbyOriginLocation, setNearbyOriginLocation] = useState<
    string | null | undefined
  >(undefined)

  useEffect(() => {
    if (youLover) {
      setNearbyOriginLocation(youLover.geodb_city_id)
    }
  }, [youLover])
  const nearbyCities = useNearbyCities(nearbyOriginLocation, debouncedRadius)

  const [openFiltersModal, setOpenFiltersModal] = useState(false)
  // const [isYourFilters, setIsYourFilters] = useState(false)

  const yourFilters: Partial<FilterFields> = {
    genders: youLover?.pref_gender,
    pref_gender: youLover ? [youLover.gender] : undefined,
    pref_age_max: youLover?.pref_age_max,
    pref_age_min: youLover?.pref_age_min,
    geodbCityIds: nearbyCities ?? undefined,
    pref_relation_styles: youLover?.pref_relation_styles,
    wants_kids_strength: wantsKidsDatabaseToWantsKidsFilter(
      (youLover?.wants_kids_strength ?? 2) as wantsKidsDatabase
    ),
    has_kids: wantsKidsToHasKidsFilter(
      (youLover?.wants_kids_strength ?? 2) as wantsKidsDatabase
    ),
  }

  const isYourFilters =
    !!youLover &&
    !!filters.geodbCityIds &&
    filters.genders == yourFilters.genders &&
    !!filters.pref_gender &&
    filters.pref_gender.length == 1 &&
    filters.pref_gender[0] == youLover.gender &&
    filters.pref_age_max == yourFilters.pref_age_max &&
    filters.pref_age_min == yourFilters.pref_age_min &&
    filters.pref_relation_styles == yourFilters.pref_relation_styles &&
    filters.wants_kids_strength == yourFilters.wants_kids_strength &&
    filters.has_kids == yourFilters.has_kids

  useEffect(() => {
    debouncedSetRadius(radius)
  }, [radius])

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
        filters.has_kids !== -1 &&
        ((filters.has_kids == 0 && lover.has_kids && lover.has_kids > 0) ||
          (filters.has_kids == 1 && (!lover.has_kids || lover.has_kids < 1)))
      ) {
        return false
      } else if (
        filters.pref_relation_styles !== undefined &&
        filters.pref_relation_styles.length > 0 &&
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
  return (
    <Col className={'text-ink-600 w-full gap-2 py-2 text-sm'}>
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
          <Button
            color="none"
            size="sm"
            className="border-ink-300 border sm:hidden "
            onClick={() => setOpenFiltersModal(true)}
          >
            <IoFilterSharp className="h-5 w-5" />
          </Button>
        </Row>
      </Row>
      <Row
        className={
          'border-ink-300 dark:border-ink-300 hidden flex-wrap items-center gap-2 pb-4 pt-1 sm:inline-flex'
        }
      >
        <DesktopFilters
          filters={filters}
          youLover={youLover}
          radius={radius}
          setRadius={setRadius}
          updateFilter={updateFilter}
          clearFilters={clearFilters}
          nearbyOriginLocation={nearbyOriginLocation}
          nearbyCities={nearbyCities}
          setYourFilters={setYourFilters}
          isYourFilters={isYourFilters}
        />
      </Row>
      <RightModal
        className="bg-canvas-0 w-2/3 text-sm sm:hidden"
        open={openFiltersModal}
        setOpen={setOpenFiltersModal}
      >
        <MobileFilters
          filters={filters}
          youLover={youLover}
          radius={radius}
          setRadius={setRadius}
          updateFilter={updateFilter}
          clearFilters={clearFilters}
          nearbyOriginLocation={nearbyOriginLocation}
          nearbyCities={nearbyCities}
          setYourFilters={setYourFilters}
          isYourFilters={isYourFilters}
        />
      </RightModal>
    </Col>
  )
}
