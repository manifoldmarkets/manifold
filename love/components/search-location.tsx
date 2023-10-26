import axios from 'axios'
import { useState } from 'react'
import { Input } from 'web/components/widgets/input'

type SearchResult = {
  formatted: string
  geometry: { lat: number; lng: number }
  components: { country?: string }
}

const CitySearchBox: React.FC = () => {
  const [query, setQuery] = useState<string>('')
  const [results, setResults] = useState<SearchResult[]>([])

  const openCageKey = 'PUTHERE'
  const limit = 10

  const searchCities = async () => {
    try {
      const response = await axios.get(
        `https://api.opencagedata.com/geocode/v1/json?q=${query}&key=${openCageKey}`
      )
      const filteredResults = response.data.results.filter((result: any) => {
        const lowerCaseQuery = query.toLowerCase()
        const city = result.components.city || ''
        const state = result.components.state || ''
        const country = result.components.country || ''
        return (
          (city &&
            city !== '' &&
            country &&
            country !== '' &&
            city.toLowerCase().includes(lowerCaseQuery)) ||
          state.toLowerCase().includes(lowerCaseQuery) ||
          country.toLowerCase().includes(lowerCaseQuery)
        )
      })
      setResults(filteredResults.slice(0, 5)) // Take only top 5 results after filtering
    } catch (error) {
      console.error('Error fetching data: ', error)
      setResults([])
    }
  }
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
    if (event.target.value.length > 2) {
      searchCities()
    }
  }

  return (
    <div>
      <Input
        placeholder={'Search a city'}
        className={'w-full max-w-xs'}
        onChange={handleInputChange}
        value={query}
      />
      {results.length > 0 && (
        <ul>
          {results.map((result, index) => (
            <li key={index}>
              {/* <strong>{result.formatted}</strong> - {result.components.country} */}
              {/* <div>{result.components}</div> */}
              <Result result={result} />
              <br />
              {result.components.city}, {result.components.state}
              {result.components.country}
              {/* Coordinates: ({result.geometry.lat}, {result.geometry.lng}) */}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Result(props: { result: any }) {
  console.log(props.result)
  return <></>
}
export default CitySearchBox
