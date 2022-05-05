import _ from 'lodash'
import { useState, useMemo } from 'react'
import { charities, Charity as CharityType } from '../../../common/charity'
import { CharityCard } from '../../components/charity/charity-card'
import { Col } from '../../components/layout/col'
import { Spacer } from '../../components/layout/spacer'
import { Page } from '../../components/page'
import { SiteLink } from '../../components/site-link'
import { Title } from '../../components/title'
import { getAllCharityTxns } from '../../lib/firebase/txns'

export async function getStaticProps() {
  const txns = await getAllCharityTxns()
  const totals = _.mapValues(_.groupBy(txns, 'toId'), (txns) =>
    _.sumBy(txns, (txn) => txn.amount)
  )
  const totalRaised = _.sum(Object.values(totals))
  const sortedCharities = _.sortBy(charities, [
    (charity) => (charity.tags?.includes('Featured') ? 0 : 1),
    (charity) => -totals[charity.id],
  ])

  return {
    props: {
      totalRaised,
      charities: sortedCharities,
    },
    revalidate: 60,
  }
}

export default function Charity(props: {
  totalRaised: number
  charities: CharityType[]
}) {
  const { totalRaised, charities } = props

  const [query, setQuery] = useState('')
  const debouncedQuery = _.debounce(setQuery, 50)

  const filterCharities = useMemo(
    () =>
      charities.filter(
        (charity) =>
          charity.name.toLowerCase().includes(query.toLowerCase()) ||
          charity.preview.toLowerCase().includes(query.toLowerCase()) ||
          charity.description.toLowerCase().includes(query.toLowerCase()) ||
          (charity.tags as string[])?.includes(query.toLowerCase())
      ),
    [query]
  )

  return (
    <Page>
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-xl gap-2">
          <Title className="!mt-0" text="Manifold for Good" />
          <div className="mb-6 text-gray-500">
            Donate your winnings to charity! Through the month of May, every M$
            100 you contribute turns into $1 USD sent to your chosen charity.
            <Spacer h={5} />
            Together we've donated over ${Math.floor(totalRaised / 100)} USD so
            far!
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
          Don't see your favorite charity? Recommend it{' '}
          <SiteLink
            href="https://manifold.markets/Sinclair/which-charities-should-manifold-add"
            className="text-indigo-700"
          >
            here
          </SiteLink>
          !
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
