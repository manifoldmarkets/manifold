// src/components/SearchBar.tsx
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Input } from 'web/components/widgets/input'
import { searchLocation } from 'web/lib/firebase/api'
import { Row as rowFor } from 'common/supabase/utils'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ReactNode } from 'react'

export type City = {
  geodb_city_id: string
  city: string
  region_code: string
  country: string
  city_latitude: number
  city_longitude: number
}

export function loverToCity(lover: rowFor<'lovers'>) {
  return {
    geodb_city_id: lover.geodb_city_id,
    city: lover.city,
    region_code: lover.region_code,
    country: lover.country,
    city_latitude: lover.city_latitude,
    city_longitude: lover.city_longitude,
  } as City
}

export function CitySearchBox(props: {
  onCitySelected: (city: City | undefined) => void
  selected: boolean
  selectedNode: ReactNode | undefined
  searchBoxClassName?: string
  excludeCityIds?: string[]
  placeholder?: string
}) {
  const {
    onCitySelected,
    selected,
    selectedNode,
    searchBoxClassName,
    excludeCityIds,
    placeholder,
  } = props
  const [query, setQuery] = useState('')
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(false)
  const [dropdownVisible, setDropdownVisible] = useState(false)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const searchCountRef = useRef(0)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        searchCountRef.current++
        const thisSearchCount = searchCountRef.current
        const response = await searchLocation({ term: query, limit: 5 })
        if (thisSearchCount == searchCountRef.current) {
          setCities(
            response.data.data.map((city: any) => ({
              geodb_city_id: city.id.toString(),
              city: city.name,
              region_code: city.regionCode,
              country: city.country,
              city_latitude: city.latitude,
              city_longitude: city.longitude,
            }))
          )
        }
      } catch (error) {
        console.error('Error fetching cities', error)
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(() => {
      if (query.length < 2) {
        setCities([])
        return
      }
      if (query.length >= 2) {
        fetchData()
      }
    }, 200)

    return () => {
      clearTimeout(debounce)
    }
  }, [query])

  if (selected) {
    return <>{selectedNode}</>
  }

  return (
    <div className="relative w-full">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? 'Search for a city...'}
        className={clsx(searchBoxClassName, 'w-full')}
        autoFocus
        onFocus={() => setDropdownVisible(true)}
        onBlur={(e) => {
          if (
            dropdownRef.current &&
            dropdownRef.current.contains(e.relatedTarget)
          ) {
            return // Do not hide the dropdown if clicking inside the dropdown
          }
          setTimeout(() => setDropdownVisible(false), 300)
        }}
      />
      {cities.length > 0 && dropdownVisible && (
        <ul
          className={clsx(
            loading
              ? 'pointer-events-none animate-pulse cursor-not-allowed'
              : '',
            'border-1 border-ink-400 bg-canvas-0 absolute z-10 w-full rounded-b border text-sm drop-shadow'
          )}
          ref={dropdownRef}
        >
          {cities.length < 1 && loading && <LoadingIndicator />}
          {cities.map((city, index) => {
            if (excludeCityIds && excludeCityIds.includes(city.geodb_city_id)) {
              return null
            }
            return (
              <li
                key={index}
                onClick={() => {
                  onCitySelected(city)
                  setQuery('')
                  setCities([])
                }}
              >
                <CityRow
                  city={city}
                  className="hover:bg-primary-200 px-4 py-2"
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function CityRow(props: { city: City; className?: string }) {
  const { city, className } = props
  return (
    <Col className={clsx(className, 'w-full justify-between transition-all')}>
      <span className="font-semibold">
        {city.city}
        {city.region_code ? `, ${city.region_code}` : ''}{' '}
      </span>
      <div className="text-ink-400">{city.country}</div>
    </Col>
  )
}
