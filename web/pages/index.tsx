import { ReactNode, useEffect, useState } from 'react'
import Router from 'next/router'

import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Post } from 'common/post'
import { ActivitySection, FeaturedSection, SearchSection } from './home'
import { Sort } from 'web/components/contract-search'
import { ContractCard } from 'web/components/contract/contract-card'
import { PostCard } from 'web/components/posts/post-card'
import {
  useContractsByDailyScore,
  useTrendingContracts,
} from 'web/hooks/use-contracts'
import { Contract } from 'common/contract'
import { DESTINY_GROUP_SLUGS, ENV_CONFIG } from 'common/envs/constants'
import { Row } from 'web/components/layout/row'
import Link from 'next/link'
import { ChartBarIcon, ExclamationCircleIcon } from '@heroicons/react/solid'
import TestimonialsPanel from './testimonials-panel'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { Modal } from 'web/components/layout/modal'
import { Title } from 'web/components/widgets/title'
import { formatMoney } from 'common/util/format'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  return {
    props: {},
  }
})

export default function Home() {
  useSaveReferral()
  useRedirectAfterLogin()

  const blockedFacetFilters = DESTINY_GROUP_SLUGS.map(
    (slug) => `groupSlugs:-${slug}`
  )

  const globalConfig = useGlobalConfig()
  const trendingContracts = useTrendingContracts(6, blockedFacetFilters)
  const dailyTrendingContracts = useContractsByDailyScore(
    6,
    blockedFacetFilters
  )
  const [pinned, setPinned] = usePersistentState<JSX.Element[] | null>(null, {
    store: inMemoryStore(),
    key: 'home-pinned',
  })

  useEffect(() => {
    const pinnedItems = globalConfig?.pinnedItems
    if (pinnedItems) {
      const itemComponents = pinnedItems.map((element) => {
        if (element.type === 'post') {
          const post = element.item as Post
          return <PostCard post={post} pinned={true} />
        } else if (element.type === 'contract') {
          const contract = element.item as Contract
          return <ContractCard contract={contract} pinned={true} />
        }
      })
      setPinned(
        itemComponents.filter(
          (element) => element != undefined
        ) as JSX.Element[]
      )
    }
  }, [globalConfig, setPinned])
  const isLoading =
    !trendingContracts || !globalConfig || !pinned || !dailyTrendingContracts
  return (
    <Page>
      <SEO
        title="Manifold Markets"
        description="Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!"
      />
      <Col className="mx-auto mb-8 max-w-3xl gap-4 px-4">
        <LandingPagePanel />
        <Row className="w-full gap-2 sm:gap-4">
          <ExternalInfoCard
            link="https://help.manifold.markets/"
            icon={<div className="text-2xl">?</div>}
            text="About & Help"
          />
          <InfoCard
            link="https://help.manifold.markets/introduction-to-manifold-markets/what-is-mana-m"
            icon={<div className="text-2xl">{ENV_CONFIG.moneyMoniker}</div>}
            text="What is Mana?"
            modal={<ManaExplainer />}
          />
          <InfoCard
            link="https://help.manifold.markets/introduction-to-manifold-markets/what-are-prediction-markets"
            icon={<ChartBarIcon className="mx-auto h-8 w-8" />}
            text="What is a Prediction Market?"
            modal={<PredictionMarketExplainer />}
          />
        </Row>
        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            <SearchSection
              key={'score'}
              label={'Trending'}
              contracts={trendingContracts}
              sort={'score' as Sort}
              icon={'🔥'}
            />
            <SearchSection
              key={'daily-trending'}
              label={'Daily changed'}
              contracts={dailyTrendingContracts}
              sort={'daily-score'}
              icon={'📈'}
            />
            <ActivitySection key={'live-feed'} />
            <FeaturedSection
              key={'featured'}
              globalConfig={globalConfig}
              pinned={pinned}
              isAdmin={false}
            />
          </>
        )}
        <TestimonialsPanel />
      </Col>
    </Page>
  )
}

export function ExternalInfoCard(props: {
  link: string
  icon: ReactNode
  text: string
}) {
  const { link, icon, text } = props
  return (
    <Link
      className="group flex w-1/3 flex-col items-center gap-1 rounded-xl bg-indigo-700 px-4 py-2 text-center text-sm text-white drop-shadow-sm transition-all hover:drop-shadow-lg"
      href={link}
      target="_blank"
    >
      <div className="text-indigo-400 transition-colors group-hover:text-white">
        {icon}
      </div>
      <div>
        {text}
        <span>
          <GoToIcon className="mb-1 ml-2 inline h-4 w-4 text-white" />
        </span>
      </div>
    </Link>
  )
}

export function InfoCard(props: {
  link: string
  icon: ReactNode
  text: string
  externalLink?: boolean
  modal: ReactNode
}) {
  const { link, icon, text, externalLink, modal } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Modal open={open} setOpen={setOpen} size="md">
        <Col className="rounded-md bg-white px-8 pb-6 pt-0 text-sm font-light md:text-lg">
          <Title text={text} />
          {modal}
          <Link
            href={link}
            className="mt-2 text-indigo-700 underline"
            target="_blank"
          >
            Learn more{' '}
            <span>
              <GoToIcon className="mb-1 ml-1 inline h-4 w-4 text-indigo-700" />
            </span>
          </Link>
        </Col>
      </Modal>
      <button
        className="group flex w-1/3 flex-col items-center gap-1 rounded-xl bg-indigo-700 px-4 py-2 text-center text-sm text-white drop-shadow-sm transition-all hover:drop-shadow-lg"
        onClick={() => setOpen(true)}
      >
        <div className="text-indigo-400 transition-colors group-hover:text-white">
          {icon}
        </div>
        <div>
          <div>{text}</div>
          {externalLink && (
            <span>
              <GoToIcon className="mb-1 ml-2 inline h-4 w-4 text-indigo-400" />
            </span>
          )}
        </div>
      </button>
    </>
  )
}

export function ManaExplainer() {
  return (
    <>
      <img
        className="mx-auto mb-8 w-[60%] object-contain"
        src={'/welcome/treasure.png'}
      />
      <p>
        <span className="font-normal text-indigo-700">
          Mana ({ENV_CONFIG.moneyMoniker})
        </span>{' '}
        is the play money you bet with. You can also turn it into a real
        donation to charity, at a 100:1 ratio.
      </p>
      <Row className="mt-4 gap-2 rounded border border-gray-200 bg-gray-50 py-2 pl-2 pr-4 text-sm text-indigo-700">
        <ExclamationCircleIcon className="h-5 w-5" />
        Mana can not be traded in for real money.
      </Row>
      <div className="mt-4 font-semibold text-gray-400">EXAMPLE</div>
      <div className="mb-4 border-l-2 border-indigo-700 bg-indigo-50 py-2 px-2">
        <p>
          When you donate{' '}
          <span className="font-semibold">{formatMoney(1000)}</span> to
          Givewell, Manifold sends them{' '}
          <span className="font-semibold">$10 USD</span>.
        </p>
      </div>
    </>
  )
}

export function PredictionMarketExplainer() {
  return (
    <>
      <p>
        Prediction markets allow you to bet on the outcome of future events. On
        Manifold, anyone can create their own prediction market about any
        question they want!
      </p>
      <div className="mt-4 font-semibold text-gray-400">EXAMPLE</div>
      <div className="mb-4 border-l-2 border-indigo-700 bg-indigo-50 py-2 px-2">
        <p className="mt-2">
          <span className="font-semibold text-indigo-700">
            "Will Democrats win the 2024 US presidential election?"
          </span>
        </p>
        <p className="mt-4">
          If I think the Democrats are very likely to win, and you disagree, I
          might offer <b>$70</b> to your <b>$30</b> (with the winner taking home
          <b> $100</b> total).
        </p>
        <p className="mt-4">
          This set of bets implies a <b>70% probability</b> of the Democrats
          winning. As more people bet, the implied probability will converge to
          the market's best estimate.
        </p>
      </div>
    </>
  )
}

const useRedirectAfterLogin = () => {
  const user = useUser()

  useEffect(() => {
    if (user) {
      Router.replace('/home')
    }
  }, [user])
}
