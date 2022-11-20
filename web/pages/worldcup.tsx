import Masonry from 'react-masonry-css'

import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { SiteLink } from 'web/components/widgets/site-link'
import { ContractCard } from 'web/components/contract/contract-card'
import { Spacer } from 'web/components/layout/spacer'
import { Tabs } from 'web/components/layout/tabs'
import { useIsMobile } from 'web/hooks/use-is-mobile'

const group_winners = [
  // groups A through H
  'which-country-will-win-group-a-of-t-506d1ab4e4ec',
  'which-country-will-win-group-b-of-t',
  'which-country-will-win-group-c-of-t',
  'which-country-will-win-group-d-of-t',
  'httpsenwikipediaorgwiki2022fifaworl',
  'which-country-will-win-group-f-of-t',
  'which-country-will-win-group-g-of-t',
  'which-country-will-win-group-h-of-t',
]

const group_runnerups = [
  'which-country-will-win-group-a-of-t-506d1ab4e4ec',
  'which-country-will-win-group-b-of-t',
  'which-country-will-win-group-c-of-t',
  'which-country-will-win-group-d-of-t',
  'httpsenwikipediaorgwiki2022fifaworl',
  'which-country-will-win-group-f-of-t',
  'which-country-will-win-group-g-of-t',
  'which-country-will-win-group-h-of-t',
]

const general_markets = [
  'which-country-will-win-the-2022-fif',
  'will-a-team-score-7-or-more-goals-i',
  'will-luis-suarez-bite-another-playe',
  'will-a-nation-outside-of-europe-or',
  'will-iran-be-removed-from-the-world',
  'what-countries-will-make-it-to-the-b27d5c3e5461',
  'will-any-player-in-the-2022-fifa-wo',
  'will-the-total-number-of-goals-scor',
] as string[]

const round_of_16 = [] as string[]
const quarter_finals = [] as string[]
const semifinals = [] as string[]
const final = [] as string[]
const daily_markets = ['will-either-brazil-or-argentina-win'] as string[]

export async function getStaticProps() {
  const groupWinners = await getContractsFromSlugs(group_winners)

  const groupRunnerups = await getContractsFromSlugs(group_runnerups)

  const roundOf16 = await getContractsFromSlugs(round_of_16)

  const quarterFinals = await getContractsFromSlugs(quarter_finals)

  const semiFinals = await getContractsFromSlugs(semifinals)

  const finals = await getContractsFromSlugs(final)

  const dailyMarkets = await getContractsFromSlugs(daily_markets)

  const generalMarkets = await getContractsFromSlugs(general_markets)

  return {
    props: {
      groupWinners,
      groupRunnerups,
      roundOf16,
      quarterFinals,
      semiFinals,
      finals,
      dailyMarkets,
      generalMarkets,
    },
    revalidate: 60, // regenerate after a minute
  }
}

const getContractsFromSlugs = async (slugs: string[]) => {
  const contracts = (
    await Promise.all(
      slugs.map(async (slug) => {
        const contract = await getContractFromSlug(slug)
        return contract ?? null
      })
    )
  ).filter((contract) => contract != null)
  return contracts ?? []
}

export default function WorldCup(props: {
  groupWinners: Contract[]
  groupRunnerups: Contract[]
  roundOf16: Contract[]
  quarterFinals: Contract[]
  semiFinals: Contract[]
  finals: Contract[]
  dailyMarkets: Contract[]
  generalMarkets: Contract[]
}) {
  const {
    groupWinners,
    groupRunnerups,
    // dailyMarkets,
    generalMarkets,
  } = props

  const isMobile = useIsMobile()

  const groupWinnerTab = (
    <>
      <Spacer h={4} />
      <div className="row-span-full grid grid-rows-1 gap-4 sm:grid-cols-2	">
        {groupWinners.map((group, index) => (
          <GroupComponent
            group={groupWinners[index]}
            title={`GROUP ${String.fromCharCode(65 + index)} (1st Place)`}
          />
        ))}
      </div>
    </>
  )

  const groupRunnerupTab = (
    <>
      <Spacer h={4} />
      <div className="row-span-full grid grid-rows-1 gap-4 sm:grid-cols-2	">
        {groupRunnerups.map((group, index) => (
          <GroupComponent
            group={groupRunnerups[index]}
            title={`GROUP ${String.fromCharCode(65 + index)} (2nd Place)`}
          />
        ))}
      </div>
    </>
  )

  return (
    <Page className="">
      <div className={'relative p-1 px-4 pt-0'}>
        <Col className="mx-auto max-w-7xl">
          <SEO
            title="World Cup 2022"
            description="Manifold's 2022 FIFA World Cup forecast. Place your bets and win up to $500 USD in our tournament."
            image="" // TODO: Add image for preview
          />

          <div className="mb-2 text-5xl text-indigo-700">World Cup 2022</div>

          <div className="my-4 text-base text-gray-500">
            Manifold's 2022 FIFA World Cup forecast. Place your bets and{' '}
            <SiteLink href="#rules">
              win up to $500 USD in our tournament
            </SiteLink>
            .
          </div>

          <Spacer h={4} />

          {/* Might want to put an image or something here. */}

          {/* 
          <div className="mb-2  text-3xl text-indigo-500">
            Market of the Day
          </div>

          <div className="mb-4 text-base text-gray-500">
            Every day we will feature a market that we think is interesting.
            These markets will only last for 24 hours, so make sure to get your
            bets in!
          </div>

          <div className="flex items-center justify-center">
            {dailyMarkets.map((contract) => (
              <ContractCard
                className={isMobile ? 'w-full' : 'w-1/2'}
                key={contract.slug}
                contract={contract}
                showImage={true}
                hideDetails={true}
              />
            ))}
          </div>

          <Spacer h={4} />
          <Divider /> 

          <Spacer h={8} />*/}

          <div className="mb-2 text-3xl text-indigo-700">Group Stage </div>
          {isMobile && (
            <div className="mb-2  text-xl text-indigo-400">
              Pick the winner and runner-up of each group
            </div>
          )}
          <Tabs
            labelClassName="text-lg"
            tabs={[
              {
                title: isMobile ? 'Winners' : 'Pick the winner of each group',
                content: groupWinnerTab,
                className: 'w-full',
              },
              {
                title: isMobile
                  ? 'Runner-ups'
                  : 'Pick the runner-up of each group',
                content: groupRunnerupTab,
                className: 'w-full',
              },
            ]}
          />

          <Spacer h={16} />

          <div className="mb-2 text-3xl text-indigo-700">General markets</div>
          <Spacer h={4} />
          <Masonry
            breakpointCols={{ default: 2, 768: 1 }}
            className="-ml-4 flex w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {generalMarkets.map((contract, i) => (
              <ContractCard
                key={contract.slug}
                contract={contract}
                hideDetails={false}
                showImage={true}
                className="mb-4"
              />
            ))}
          </Masonry>

          <Spacer h={8} />

          <div className="mb-2 text-3xl text-indigo-700" id="rules">
            Tournament rules
          </div>
          <Spacer h={4} />

          <div className="mb-4 text-base text-gray-700">
            Manifold is sponsoring a tournament on the 2022 World Cup with a{' '}
            <strong>$500 USD prize</strong> {''}
            pool. Show off your soccer/football knowledge, and win real USD if
            you're correct.
          </div>

          <ol className="list-decimal space-y-4 px-4 text-base text-gray-700">
            <li>
              <p>
                USD prizes will be awarded to the top 5 traders on the
                leaderboard in proportion to profit earned in this group
                (excluding members of the Manifold team).
              </p>
            </li>
            <li>
              <p>Only 1 account per person can trade in this market.</p>
            </li>
            <li>
              <p>
                Don't collude with other people to inflate your or their
                profits.
              </p>
              <ul>
                <li>
                  <p>
                    E.g. don't transfer money to your friends account via
                    betting a market artificially high/low and having them
                    correct it.
                  </p>
                </li>
              </ul>
            </li>
            <li>
              <p>
                All forms of trading are allowed (including API, limit orders).
              </p>
            </li>
            <li>
              <p>
                Manifold reserves the right to modify rules, exclude
                participants, and other changes necessary to abide by the spirit
                of this tournament.
              </p>
            </li>
          </ol>
          <Spacer h={8} />
        </Col>
      </div>
    </Page>
  )
}

function GroupComponent(props: { group: Contract; title: string }) {
  const { group, title } = props
  return (
    <Col>
      <div className="text-black-500   text-xl">{title} </div>

      <ContractCard
        contract={group}
        noLinkAvatar={true}
        hideQuickBet={true}
        hideGroupLink={true}
        hideQuestion={true}
        hideDetails={true}
        numAnswersFR={4}
      />
    </Col>
  )
}
