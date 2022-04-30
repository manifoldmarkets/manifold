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
    () =>
      charities.filter((charity) =>
        charity.name.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  )

  return (
    <Page>
      <Col className="w-full items-center rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-xl gap-2">
          <Title className="!mt-0" text="Manifold for Good" />
          <div className="mb-6 text-gray-500">
            Donate your winnings to charity! Through the month of May, every M$
            100 you contribute turns into $1 USD sent to your chosen charity.
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
            😢 We couldn't find that charity...
          </div>
        )}

        <iframe
          height="405"
          src="https://manifold.markets/embed/ManifoldMarkets/total-donations-for-manifold-for-go"
          title="Total donations for Manifold for Good this May (in USD)"
          frameBorder="0"
          className="m-10 w-full rounded-xl bg-white p-10"
        ></iframe>

        <div className="mt-10 text-gray-500">
          Don't see your favorite charity? Recommend that we add it by emailing
          <span className="text-indigo-500"> give@manifold.markets</span>~
          <br />
          <br />
          <span className="italic">
            Note: Manifold is not affiliated with any of these charities (other
            than being fans of their work!)
            <br />
            As Manifold is a for-profit entity, your contributions will not be
            tax deductible.
          </span>
        </div>
      </Col>
    </Page>
  )
}
