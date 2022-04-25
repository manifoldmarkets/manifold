import _ from 'lodash'
import { useState, useMemo } from 'react'
import { charities as charityList } from '../../../common/charity'
import Card from '../../components/charity/charity-card'
import { Col } from '../../components/layout/col'
import { Page } from '../../components/page'
import { Title } from '../../components/title'

// TODO: Fetch amount raised.
const charities = charityList.map((charity) => ({
  ...charity,
  raised: 4001,
}))

export default function Charity() {
  const [query, setQuery] = useState('')
  const debouncedQuery = _.debounce(setQuery, 50)

  const filterCharities = useMemo(
    () => charities.filter((charity) => charity.name.includes(query)),
    [query]
  )

  return (
    <Page>
      <Col className="w-full rounded bg-white px-4 py-6 sm:px-8">
        <Col className="max-w-xl">
          <Title className="!mt-0" text="Donate to a charity" />
          <div className="mb-6 text-gray-500">
            Exchange your M$ for real dollars in the form of charity donations!
          </div>
          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Search charities"
            className="input input-bordered mb-6 w-full"
          />
        </Col>
        <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-3 lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
          {filterCharities.map((charity) => (
            <div key={charity.name}>
              <Card charity={charity} />
            </div>
          ))}
        </div>
        {filterCharities.length === 0 && (
          <div className="text-center text-gray-500">
            No charities match your search :(
          </div>
        )}
      </Col>
    </Page>
  )
}
