import { Combobox } from '@headlessui/react'
import { getCodeList } from 'country-list'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'

const countries = getCodeList()

export const CountryCodeSelector = (props: {
  setSelectedCountry: (code: string) => void
  selectedCountry: string
}) => {
  const { setSelectedCountry, selectedCountry } = props
  const [query, setQuery] = useState('')

  const filteredCountries =
    query === ''
      ? Object.entries(countries)
      : Object.entries(countries).filter(
          ([code, country]) =>
            country.toLowerCase().includes(query.toLowerCase()) ||
            code.toLowerCase().includes(query.toLowerCase())
        )

  return (
    <Row className="">
      <Combobox value={selectedCountry} onChange={setSelectedCountry}>
        <Combobox.Input
          className="w-full rounded-md border border-gray-300 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring"
          onChange={(e) => setQuery(e.target.value)}
          displayValue={(country: string) => country}
          placeholder="Type a country or code"
        />
        <Combobox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
          {filteredCountries.map(([code, country]) => (
            <Combobox.Option
              key={code}
              value={`${country} (${code.toUpperCase()})`}
              className={({ active }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                  active ? 'bg-blue-600 text-white' : 'text-gray-900'
                }`
              }
            >
              {({ selected, active }) => (
                <>
                  <span
                    className={`block truncate ${
                      selected ? 'font-medium' : 'font-normal'
                    }`}
                  >
                    {country} ({code.toUpperCase()})
                  </span>
                  {selected ? (
                    <span
                      className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                        active ? 'text-white' : 'text-blue-600'
                      }`}
                    >
                      ✓
                    </span>
                  ) : null}
                </>
              )}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>
    </Row>
  )
}
