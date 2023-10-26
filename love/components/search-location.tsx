// src/components/SearchBar.tsx
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { searchLocation } from 'web/lib/firebase/api'

export type City = {
  city: string
  regionCode: string
  country: string
  latitude: number
  longitude: number
}

export default function CitySearchBox(props: {
  onCitySelected: (city: City | undefined) => void
}) {
  const { onCitySelected } = props
  const [query, setQuery] = useState('')
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await searchLocation({ term: query, limit: 5 })
        setCities(
          response.data.data.map((city: any) => ({
            city: city.name,
            regionCode: city.regionCode,
            country: city.country,
            latitude: city.latitude,
            longitude: city.longitude,
          }))
        )
      } catch (error) {
        console.error('Error fetching cities', error)
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(() => {
      if (query.length >= 2) {
        fetchData()
      }
    }, 500)

    return () => {
      clearTimeout(debounce)
    }
  }, [query])

  if (selectedCity) {
    return (
      <Row className="border-primary-500 w-full justify-between rounded border px-4 py-2">
        <CityRow city={selectedCity} />
        <button
          className="text-ink-700 hover:text-primary-700 text-sm underline"
          onClick={() => {
            setSelectedCity(undefined)
            onCitySelected(undefined)
          }}
        >
          Change
        </button>
      </Row>
    )
  }

  return (
    <div className="relative w-full">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a city..."
        className="w-full"
        autoFocus
      />
      {loading && <p>Loading...</p>}
      {cities.length > 0 && (
        <ul className="border-1 bg-canvas-0 absolute z-10 w-full border text-sm drop-shadow">
          {cities.map((city, index) => (
            <li
              key={index}
              onClick={() => {
                onCitySelected(city)
                setSelectedCity(city)
                setQuery('')
                setCities([])
              }}
            >
              <CityRow city={city} className="hover:bg-primary-200 px-4 py-2" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CityRow(props: { city: City; className?: string }) {
  const { city, className } = props
  return (
    <Col className={clsx(className, 'w-full justify-between transition-all')}>
      <span className="font-semibold">
        {city.city}
        {city.regionCode ? `, ${city.regionCode}` : ''}{' '}
      </span>
      <div className="text-ink-400">{city.country}</div>
    </Col>
  )
}
