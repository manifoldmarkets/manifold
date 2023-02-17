import {
  mapValues,
  groupBy,
  sumBy,
  sum,
  sortBy,
  debounce,
  uniqBy,
} from 'lodash'
import { useState, useMemo } from 'react'
import { charities, Charity as CharityType } from 'common/charity'
import { CharityCard } from 'web/components/charity/charity-card'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { getAllCharityTxns } from 'web/lib/firebase/txns'
import { manaToUSD } from 'common/util/format'
import { quadraticMatches } from 'common/quadratic-funding'
import { useTracking } from 'web/hooks/use-tracking'
import { searchInAny } from 'common/util/parse'
import { getUser } from 'web/lib/firebase/users'
import { SiteLink } from 'web/components/widgets/site-link'
import { User } from 'common/user'
import { SEO } from 'web/components/SEO'
import { Input } from 'web/components/widgets/input'
import { ENV_CONFIG } from 'common/envs/constants'
import { AlertBox } from 'web/components/widgets/alert-box'
import Link from 'next/link'

export async function getStaticProps() {
  let txns = await getAllCharityTxns()
  // Sort by newest txns first
  txns = sortBy(txns, 'createdTime').reverse()
  const totals = mapValues(groupBy(txns, 'toId'), (txns) =>
    sumBy(txns, (txn) => txn.amount)
  )
  const totalRaised = sum(Object.values(totals))
  const sortedCharities = sortBy(charities, [
    (charity) => (charity.tags?.includes('New') ? 0 : 1),
    (charity) => -totals[charity.id],
  ])
  const matches = quadraticMatches(txns, totalRaised, 'toId')
  const numDonors = uniqBy(txns, (txn) => txn.fromId).length
  const mostRecentDonor = txns[0] ? await getUser(txns[0].fromId) : null
  const mostRecentCharity = txns[0]?.toId ?? ''

  return {
    props: {
      totalRaised,
      charities: sortedCharities,
      matches,
      numDonors,
      mostRecentDonor,
      mostRecentCharity,
    },
    revalidate: 60,
  }
}

type Stat = {
  name: string
  stat: string
  url?: string
}

function DonatedStats(props: { stats: Stat[] }) {
  const { stats } = props
  return (
    <dl className="mt-3 grid grid-cols-1 gap-5 rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 p-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.name}
          className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6"
        >
          <dt className="truncate text-sm font-medium text-gray-500">
            {stat.name}
          </dt>

          <dd className="mt-1 text-2xl font-semibold text-gray-900">
            {stat.url ? (
              <SiteLink href={stat.url}>{stat.stat}</SiteLink>
            ) : (
              <span>{stat.stat}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Charity(props: {
  totalRaised: number
  charities: CharityType[]
  matches: { [charityId: string]: number }
  numDonors: number
  mostRecentDonor?: User | null
  mostRecentCharity?: string
}) {
  const {
    totalRaised,
    charities,
    matches,
    mostRecentCharity,
    mostRecentDonor,
  } = props

  const [query, setQuery] = useState('')
  const debouncedQuery = debounce(setQuery, 50)
  const recentCharityName =
    charities.find((charity) => charity.id === mostRecentCharity)?.name ??
    'Nobody'

  const filterCharities = useMemo(
    () =>
      charities.filter(
        (charity) =>
          searchInAny(
            query,
            charity.name,
            charity.preview,
            charity.description
          ) || (charity.tags as string[])?.includes(query.toLowerCase())
      ),
    [charities, query]
  )

  useTracking('view charity')

  return (
    <Page>
      <SEO
        title="Manifold for Charity"
        description="Donate your prediction market earnings to charity on Manifold."
        url="/charity"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="">
          <Title>Manifold for Charity</Title>

          <AlertBox title="Charity program ending" text="">
            Please make your final donations before March 1st, 2023.
            <SiteLink
              href="https://manifoldmarkets.notion.site/Charity-program-ending-March-1st-ac5da2d66e9d4306a917e3dd653b9cea"
              className="ml-2 text-indigo-700"
            >
              Read more here.
            </SiteLink>
          </AlertBox>

          <span className="mt-8 text-gray-600">
            Convert your {ENV_CONFIG.moneyMoniker} earnings into real charitable
            donations.{' '}
          </span>
          <DonatedStats
            stats={[
              {
                name: 'Raised by Manifold users',
                stat: manaToUSD(totalRaised),
              },
              {
                name: 'Most recent donor',
                stat: mostRecentDonor?.name ?? 'Nobody',
                url: `/${mostRecentDonor?.username}`,
              },
              {
                name: 'Most recent donation',
                stat: recentCharityName,
                url: `/charity/${mostRecentCharity}`,
              },
            ]}
          />
          <Spacer h={10} />

          <Input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Find a charity"
            className="mb-6 w-full"
          />
        </Col>
        <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-4 self-center lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
          {filterCharities.map((charity) => (
            <CharityCard
              charity={charity}
              key={charity.name}
              match={matches[charity.id]}
            />
          ))}
        </div>
        {filterCharities.length === 0 && (
          <div className="text-center text-gray-500">
            😢 We couldn't find that charity...
          </div>
        )}

        <div className="mt-10 w-full rounded-xl bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-400 p-5">
          <iframe
            height="405"
            src="https://manifold.markets/Austin/how-many-will-be-donated-through-ma"
            title="How many $ will be donated through Manifold's Giving Tuesday?"
            frameBorder="0"
            className="w-full rounded-xl bg-white p-10"
          />
        </div>

        <div className="prose mt-10 max-w-none text-gray-500">
          <span className="text-lg font-semibold">Notes</span>
          <ul>
            <li>
              Don't see your favorite 501c3 charity? Contact us at{' '}
              <a href="mailto:charity@manifold.markets?subject=Add%20Charity">
                charity@manifold.markets
              </a>
              !
            </li>
            <li>Manifold is not affiliated with any of the above charities.</li>
            <li>
              Unfortunately, your contributions will not be tax deductible.
            </li>
            <li>Donations are wired once each quarter.</li>
            <li>
              Manifold reserves the right to cancel its charity program at any
              time.
            </li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
