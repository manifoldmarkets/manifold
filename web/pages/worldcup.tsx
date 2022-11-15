import { Contract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { SiteLink } from 'web/components/widgets/site-link'
import { Row } from 'web/components/layout/row'
import { ContractCard } from 'web/components/contract/contract-card'
import { Spacer } from 'web/components/layout/spacer'
import { Card } from 'web/components/widgets/card'
import { Tabs } from 'web/components/layout/tabs'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import Masonry from 'react-masonry-css'

const group_winners = [
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

const round_of_16 = [] as string[]
const quarter_finals = [] as string[]
const semifinals = [] as string[]
const final = [] as string[]
const daily_markets = ['will-either-brazil-or-argentina-win'] as string[]
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

const App = (props: {
  groupWinners: Contract[]
  groupRunnerups: Contract[]
  roundOf16: Contract[]
  quarterFinals: Contract[]
  semiFinals: Contract[]
  finals: Contract[]
  dailyMarkets: Contract[]
  generalMarkets: Contract[]
}) => {
  const {
    groupWinners,
    groupRunnerups,
    dailyMarkets /*roundOf16, quarterFinals, semiFinals, finals*/,
    generalMarkets,
  } = props

  const [hideRoundOf16, setHideRoundOf16] = useState(true)
  const [hideQuarterFinals, setHideQuarterFinals] = useState(true)
  const [hideSemiFinals, setHideSemiFinals] = useState(true)
  const [hideFinals, setHideFinals] = useState(true)

  const isMobile = useIsMobile()

  const groupWinnerTab = (
    <>
      <Spacer h={4} />
      <div className="row-span-full grid grid-rows-1 gap-1 sm:grid-cols-2	">
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
      <div className="row-span-full grid grid-rows-1 gap-1 sm:grid-cols-2	">
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
          <SEO title="World Cup 2022 " description="Wc 2022." image="" />

          <div className="mb-2  text-5xl text-indigo-700">
            FIFA World Cup 2022 Tournament
          </div>

          <div className="mb-2 text-base text-gray-500">
            Manifold's World Cup forecast. Bet on results and{' '}
            <SiteLink href="/group/us-2022-midterms/about">
              win up to $1,000 USD in our tournament
            </SiteLink>
            . Only the markets shown in this page will be considered for the
            tournament.
          </div>
          <Divider />
          <Spacer h={8} />

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

          <Spacer h={8} />
          <div className="mb-2  text-3xl text-indigo-500">Group Stage </div>
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

          <Spacer h={4} />
          <div className="mb-2  text-3xl text-indigo-500">Round of 16 </div>
          {hideRoundOf16 ? (
            <div className="flex-start flex">
              <Button
                className="text-xl"
                color="gray-white"
                onClick={() => setHideRoundOf16(false)}
              >
                <ChevronDownIcon className="h-5 w-5" />
                Show Round of 16
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2  text-xl text-indigo-400">
                Pick the winner of each match{' '}
              </div>

              <Spacer h={4} />

              <div className="row-span-full grid  grid-rows-1 gap-1 sm:grid-cols-2	">
                <MatchComponent match={undefined} title="TBD - Match 49" />
                <MatchComponent match={undefined} title="TBD - Match 50" />
                <MatchComponent match={undefined} title="TBD - Match 51" />
                <MatchComponent match={undefined} title="TBD - Match 52" />
                <MatchComponent match={undefined} title="TBD - Match 53" />
                <MatchComponent match={undefined} title="TBD - Match 54" />
                <MatchComponent match={undefined} title="TBD - Match 55" />
                <MatchComponent match={undefined} title="TBD - Match 56" />
              </div>
              <Row className="mt-4 ">
                <Button
                  color="gray-white"
                  onClick={() => setHideRoundOf16(true)}
                >
                  <ChevronUpIcon className="h-5 w-5" />
                  Hide Round of 16
                </Button>
              </Row>
            </>
          )}

          <Spacer h={4} />
          <div className="mb-2  text-3xl text-indigo-500">Quarter-Finals </div>
          {hideQuarterFinals ? (
            <div className="flex-start flex">
              <Button
                className="text-xl"
                color="gray-white"
                onClick={() => setHideQuarterFinals(false)}
              >
                <ChevronDownIcon className="h-5 w-5" />
                Show Quarter-Finals
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2  text-xl text-indigo-400">
                Pick the winner of each match{' '}
              </div>

              <Spacer h={4} />

              <div className="row-span-full grid  grid-rows-1 gap-1 sm:grid-cols-2	">
                <MatchComponent match={undefined} title="TBD - Match 57" />
                <MatchComponent match={undefined} title="TBD - Match 58" />
                <MatchComponent match={undefined} title="TBD - Match 59" />
                <MatchComponent match={undefined} title="TBD - Match 60" />
              </div>
              <Row className="mt-4 ">
                <Button
                  color="gray-white"
                  onClick={() => setHideQuarterFinals(true)}
                >
                  <ChevronUpIcon className="h-5 w-5" />
                  Hide Quarter-Finals
                </Button>
              </Row>
            </>
          )}

          <Spacer h={4} />
          <div className="mb-2  text-3xl text-indigo-500">Semi-Finals </div>
          {hideSemiFinals ? (
            <div className="flex-start flex">
              <Button
                className="text-xl"
                color="gray-white"
                onClick={() => setHideFinals(false)}
              >
                <ChevronDownIcon className="h-5 w-5" />
                Show Semi-Finals
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2  text-xl text-indigo-400">
                Pick the winner of each match{' '}
              </div>

              <Spacer h={4} />

              <div className="row-span-full grid  grid-rows-1 gap-1 sm:grid-cols-2	">
                <MatchComponent match={undefined} title="TBD - Match 61" />
                <MatchComponent match={undefined} title="TBD - Match 62" />
              </div>
              <Row className="mt-4 ">
                <Button
                  color="gray-white"
                  onClick={() => setHideSemiFinals(true)}
                >
                  <ChevronUpIcon className="h-5 w-5" />
                  Hide Semi-Finals
                </Button>
              </Row>
            </>
          )}

          <Spacer h={4} />
          <div className="mb-2  text-3xl text-indigo-500">Final</div>
          {hideFinals ? (
            <div className="flex-start flex">
              <Button
                className="text-xl"
                color="gray-white"
                onClick={() => setHideFinals(false)}
              >
                <ChevronDownIcon className="h-5 w-5" />
                Show Final
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2  text-xl text-indigo-400">
                Pick the winner of the final
              </div>

              <Spacer h={4} />

              <Row className="mb-4 min-h-[100px] gap-2">
                <MatchComponent match={undefined} title="TBD - Match 63" />
              </Row>
              <Row className="mt-4 ">
                <Button color="gray-white" onClick={() => setHideFinals(true)}>
                  <ChevronUpIcon className="h-5 w-5" />
                  Hide Final
                </Button>
              </Row>
            </>
          )}
          <Spacer h={4} />

          <Divider />
          <Spacer h={8} />

          <div className="mb-2  text-5xl text-indigo-700">General Markets</div>
          <Spacer h={4} />
          <Masonry
            breakpointCols={{ default: 2, 768: 1 }}
            className="-ml-4 flex w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {generalMarkets.map((contract) => (
              <ContractCard
                key={contract.slug}
                contract={contract}
                hideDetails={true}
              />
            ))}
          </Masonry>
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

function MatchComponent(props: {
  match: Contract | undefined
  title?: string
}) {
  const { match, title } = props

  if (!match) {
    return (
      <Col className="relative min-h-[100px] w-[100%]">
        <div className="text-black-500 absolute top-0 left-0 right-0 bottom-0 text-xl">
          <Card className="h-full w-full">
            <div className="flex h-full items-center justify-center bg-gray-100">
              <div className="text-xl text-gray-500">{title ?? 'TBD'}</div>
            </div>
          </Card>
        </div>
      </Col>
    )
  }
  return (
    <ContractCard
      contract={match}
      showImage={true}
      noLinkAvatar={true}
      hideGroupLink={true}
      hideDetails={true}
    />
  )
}

function Divider() {
  return <div className="mb-4 border-t-2 border-gray-300" />
}

export default App
