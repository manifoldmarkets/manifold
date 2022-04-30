import _ from 'lodash'
import { useState, useMemo } from 'react'
import { charities as charityList } from '../../../common/charity'
import { CharityCard } from '../../components/charity/charity-card'
import { Col } from '../../components/layout/col'
import { Page } from '../../components/page'
import { Title } from '../../components/title'

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
      <Col className="w-full items-center rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-xl gap-2">
          <Title className="!mt-0" text="Donate your M$ to charity!" />
          <div className="mb-6 text-gray-500">
            Throughout the month of May, every M$ 100 you contribute turns into
            $1 USD to your chosen charity. We'll cover all processing fees!
          </div>

          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Search charities"
            className="input input-bordered mb-6 w-full"
          />
        </Col>
        <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-4 lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
          {filterCharities.map((charity) => (
            <CharityCard charity={charity} key={charity.name} />
          ))}
        </div>
        {filterCharities.length === 0 && (
          <div className="text-center text-gray-500">
            No charities match your search :(
          </div>
        )}

        <div className="mt-10 italic text-gray-500">
          Note: Manifold is not affiliated with any of these charities, other
          than being fans of their work.
          <br />
          As Manifold is a for-profit entity, your contributions will not be tax
          deductible.
        </div>
      </Col>
    </Page>
  )
}
