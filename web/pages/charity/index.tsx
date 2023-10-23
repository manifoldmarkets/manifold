import { debounce, sortBy, sum } from 'lodash'
import { useState, useMemo } from 'react'
import { charities } from 'common/charity'
import { CharityCard } from 'web/components/charity/charity-card'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import {
  getDonationsByCharity,
  getMostRecentDonation,
} from 'web/lib/supabase/txns'
import { formatMoney, manaToUSD } from 'common/util/format'
import { searchInAny } from 'common/util/parse'
import { getUser } from 'web/lib/firebase/users'
import Link from 'next/link'
import { User } from 'common/user'
import { SEO } from 'web/components/SEO'
import { Input } from 'web/components/widgets/input'
import { ENV_CONFIG } from 'common/envs/constants'
import { AlertBox } from 'web/components/widgets/alert-box'

export async function getStaticProps() {
  const [totalsByCharity, mostRecentDonation] = await Promise.all([
    getDonationsByCharity(),
    getMostRecentDonation(),
  ])
  return {
    props: {
      totalsByCharity,
      mostRecentCharityId: mostRecentDonation.toId,
      mostRecentDonor: await getUser(mostRecentDonation.fromId),
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
    <dl className="to-primary-400 mt-3 grid grid-cols-1 gap-5 rounded-lg bg-gradient-to-r from-pink-300 via-purple-300 p-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.name}
          className="bg-canvas-0 overflow-hidden rounded-lg px-4 py-5 shadow sm:p-6"
        >
          <dt className="text-ink-500 truncate text-sm font-medium">
            {stat.name}
          </dt>

          <dd className="text-ink-900 mt-1 text-2xl font-semibold">
            {stat.url ? (
              <Link href={stat.url}>{stat.stat}</Link>
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
  totalsByCharity: { [k: string]: number }
  mostRecentDonor?: User | null
  mostRecentCharityId?: string
}) {
  const { totalsByCharity, mostRecentCharityId, mostRecentDonor } = props

  const [query, setQuery] = useState('')
  const totalRaised = sum(Object.values(totalsByCharity))
  const debouncedQuery = debounce(setQuery, 50)
  const recentCharityName =
    charities.find((charity) => charity.id === mostRecentCharityId)?.name ??
    'Nobody'

  const filterCharities = useMemo(() => {
    const sortedCharities = sortBy(charities, [
      (c) => -(totalsByCharity[c.id] ?? 0),
      (c) => c.name,
    ])
    return sortedCharities.filter(
      (charity) =>
        searchInAny(
          query,
          charity.name,
          charity.preview,
          charity.description
        ) || (charity.tags as string[])?.includes(query.toLowerCase())
    )
  }, [charities, totalsByCharity, query])

  return (
    <Page trackPageView={'charity'}>
      <SEO
        title="Manifold for Charity"
        description="Donate your prediction market earnings to charity on Manifold."
        url="/charity"
      />
      <Col className="w-full rounded px-4 py-6 sm:px-8 xl:w-[125%]">
        <Col className="">
          <Title>Manifold for Charity</Title>

          <span className="text-ink-500">
            Convert your {ENV_CONFIG.moneyMoniker} earnings into real charitable
            donations at a ratio of{' '}
            <span className="semibold">{formatMoney(100)} : $1</span>.
            <a
              href="https://manifoldmarkets.notion.site/Charitable-donation-program-668d55f4ded147cf8cf1282a007fb005"
              target="_blank"
              rel="noreferrer"
              className="text-primary-700 ml-2"
            >
              Read more here.
            </a>
          </span>
          <AlertBox title="2024 changes" className="mt-4 max-w-2xl">
            Starting January 1st, 2024 Manifold user donations will be{' '}
            <a
              href="https://manifoldmarkets.notion.site/The-New-Deal-for-Manifold-s-Charity-Program-1527421b89224370a30dc1c7820c23ec"
              target="_blank"
              rel="noreferrer"
              className="text-primary-700"
            >
              capped at $10,000 per month
            </a>
            .
          </AlertBox>
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
                url: `/charity/${mostRecentCharityId}`,
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
          {filterCharities.map((charity, i) => (
            <CharityCard
              charity={charity}
              raised={totalsByCharity[charity.id]}
              key={charity.id}
            />
          ))}
        </div>
        {filterCharities.length === 0 && (
          <div className="text-ink-500 text-center">
            😢 We couldn't find that charity...
          </div>
        )}

        <div className="prose text-ink-500 mt-10 max-w-none">
          <span className="text-lg font-semibold">Notes</span>
          <ul>
            <li>
              Don't see your favorite 501c3 charity? Contact us at{' '}
              <a
                href="mailto:charity@manifold.markets?subject=Add%20Charity"
                className="text-primary-500"
              >
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
