import { mapValues, groupBy, sumBy, sum, sortBy, debounce } from 'lodash'
import { useState, useMemo } from 'react'
import { charities, Charity as CharityType } from 'common/charity'
import { CharityCard } from 'web/components/charity/charity-card'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Page } from 'web/components/page'
import { SiteLink } from 'web/components/site-link'
import { Title } from 'web/components/title'
import { getAllCharityTxns } from 'web/lib/firebase/txns'
import { formatMoney } from 'common/util/format'

export async function getStaticProps() {
  const txns = await getAllCharityTxns()
  const totals = mapValues(groupBy(txns, 'toId'), (txns) =>
    sumBy(txns, (txn) => txn.amount)
  )
  const totalRaised = sum(Object.values(totals))
  const sortedCharities = sortBy(charities, [
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
  const debouncedQuery = debounce(setQuery, 50)

  const filterCharities = useMemo(
    () =>
      charities.filter(
        (charity) =>
          charity.name.toLowerCase().includes(query.toLowerCase()) ||
          charity.preview.toLowerCase().includes(query.toLowerCase()) ||
          charity.description.toLowerCase().includes(query.toLowerCase()) ||
          (charity.tags as string[])?.includes(query.toLowerCase())
      ),
    [charities, query]
  )

  return (
    <Page>
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="max-w-xl gap-2">
          <Title className="!mt-0" text="Manifold for Charity" />
          <div className="mb-6 text-gray-500">
            Donate your winnings to charity! Every {formatMoney(100)} you give
            turns into $1 USD we send to your chosen charity.
            <Spacer h={5} />
            Together we've donated over ${Math.floor(totalRaised / 100)} USD so
            far!
          </div>

          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Search charities"
            className="input input-bordered mb-6 w-full dark:bg-black"
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
          title="Total donations for Manifold for Charity this May (in USD)"
          frameBorder="0"
          className="m-10 w-full rounded-xl bg-white dark:bg-black p-10"
        ></iframe>

        <div className="mt-10 text-gray-500">
          Don't see your favorite charity? Recommend it{' '}
          <SiteLink
            href="https://manifold.markets/Sinclair/which-charities-should-manifold-add"
            className="text-indigo-700 dark:text-indigo-300"
          >
            here
          </SiteLink>
          !
          <br />
          <br />
          <span className="italic">
            Note: Manifold is not affiliated with non-Featured charities; we're
            just fans of their work!
            <br />
            As Manifold is a for-profit entity, your contributions will not be
            tax deductible.
          </span>
        </div>
      </Col>
    </Page>
  )
}
