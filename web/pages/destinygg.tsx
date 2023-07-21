import { ReactNode, useState } from 'react'
import { CheckmarkIcon } from 'react-hot-toast'
import Link from 'next/link'
import { ChartBarIcon } from '@heroicons/react/solid'

import { ENV_CONFIG } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { formatMoney } from 'common/util/format'
import { Subtitle } from 'web/components/widgets/subtitle'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Spacer } from 'web/components/layout/spacer'
import TestimonialsPanel from './testimonials-panel'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { claimDestinySub } from 'web/lib/firebase/api'
import { ManaExplainer } from '.'
import { Modal } from 'web/components/layout/modal'
import GoToIcon from 'web/lib/icons/go-to-icon'
import { AlertBox } from 'web/components/widgets/alert-box'
import { Contract } from 'common/contract'
import { searchContract } from 'web/lib/supabase/contracts'
import { getTotalSubs } from 'web/lib/firebase/utils'


export async function getStaticProps() {
  const subCount = await getTotalSubs()

  const trendingContracts = (
    await searchContract({
      query: '',
      filter: 'open',
      sort: 'score',
      limit: 6,
      group_id: 'W2ES30fRo6CCbPNwMTTj',
    })
  ).data

  return {
    props: {
      subCount,
      trendingContracts,
    },
    revalidate: 60, // regenerate after a minute
  }
}

export default function DestinyLandingPage(props: {
  subCount: number
  trendingContracts: Contract[]
  subCount: number
}) {
  const { subCount, trendingContracts } = props

  useSaveReferral()
  useTracking('view destiny landing page')

  const [destinyUsername, setDestinyUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const privateUser = usePrivateUser()
  const user = useUser()

  const destinySubClaimed = privateUser?.destinySubClaimed ?? false

  const submit = async () => {
    if (!destinyUsername) return

    setIsSubmitting(true)
    setError('')

    await claimDestinySub({ destinyUsername })
      .then(() => setIsSuccess(true))
      .catch((err) => {
        setError(err.message)
        setIsSubmitting(false)
      })
  }

  const disabled = isSubmitting || !privateUser || !user || user.balance < 1000

  return (
    <Page>
      <SEO
        title="Destiny on Manifold"
        description="Get more out of Twitch with play-money betting questions."
      />

      <Col className="text-ink-600 bg-canvas-0 max-w-3xl rounded p-4 shadow-md sm:mx-auto sm:p-10">
        <Title>Claim a Destiny tier-1 subscription!</Title>
        <div>
          Support Destiny by trading in our questions. Claim a sub for you or a
          friend for the cost of {formatMoney(1000)}. For each subscription,
          Manifold will pay Destiny $5.00 on your behalf!
        </div>
        {destinySubClaimed ? (
          <Row className="my-4 items-center self-center text-xl">
            <CheckmarkIcon className="mr-2" /> Destiny subscription claimed!
          </Row>
        ) : (
          <Row className="mt-8">
            <Input
              type="text"
              placeholder="Destiny.gg account name"
              className="mr-4 w-[50%]"
              disabled={disabled}
              value={destinyUsername}
              onChange={(e) => setDestinyUsername(e.target.value)}
            />
            <Button
              color="gradient-pink"
              disabled={disabled}
              loading={isSubmitting}
              onClick={submit}
            >
              Pay {formatMoney(1000)} for sub
            </Button>
          </Row>
        )}
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        <div className="mt-4 pt-6 sm:mt-0">
          Total subs claimed: {subCount + (isSuccess ? 1 : 0)} / 1,000
        </div>

        <Spacer h={2} />
        <AlertBox title="Sub redemption ending" text="">
          Claim your sub before March 1st, 2023.
        </AlertBox>

        <Spacer h={2} />
        <Subtitle>New to Manifold?</Subtitle>
        <Col className=" max-w-3xl gap-4 px-4">
          <LandingPagePanel />
          <Row className="w-full gap-2 sm:gap-4">
            <ExternalInfoCard
              link="https://manifold.markets/post/welcome-explanation-for-newcomers-f"
              icon={<div className="text-2xl">?</div>}
              text="Welcome Explanation"
            />
            <InfoCard
              link="https://docs.manifold.markets/faq#what-is-mana-m"
              icon={<div className="text-2xl">{ENV_CONFIG.moneyMoniker}</div>}
              text="What is Mana?"
              modal={<ManaExplainer />}
            />
            <ExternalInfoCard
              link="https://manifold.markets/group/destinygg"
              icon={<ChartBarIcon className="mx-auto h-8 w-8" />}
              text="All Dgg Questions"
            />
          </Row>
        </Col>

        <Spacer h={4} />
        <Subtitle>Trending questions</Subtitle>
        <ContractsGrid contracts={trendingContracts} />
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
      className="text-ink-0 bg-primary-700 group flex w-1/3 flex-col items-center gap-1 rounded-xl px-4 py-2 text-center text-sm drop-shadow-sm transition-all hover:drop-shadow-lg"
      href={link}
      target="_blank"
    >
      <div className="group-hover:text-ink-0 text-primary-400 transition-colors">
        {icon}
      </div>
      <div>
        {text}
        <span>
          <GoToIcon className="text-ink-0 mb-1 ml-2 inline h-4 w-4" />
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
        <Col className="bg-canvas-0 rounded-md px-8 pb-6 pt-0 text-sm md:text-lg">
          <Title children={text} />
          {modal}
          <Link
            href={link}
            className="text-primary-700 mt-2 underline"
            target="_blank"
          >
            Learn more{' '}
            <span>
              <GoToIcon className="text-primary-700 mb-1 ml-1 inline h-4 w-4" />
            </span>
          </Link>
        </Col>
      </Modal>
      <button
        className="text-ink-0 bg-primary-700 group flex w-1/3 flex-col items-center gap-1 rounded-xl px-4 py-2 text-center text-sm drop-shadow-sm transition-all hover:drop-shadow-lg"
        onClick={() => setOpen(true)}
      >
        <div className="group-hover:text-ink-0 text-primary-400 transition-colors">
          {icon}
        </div>
        <div>
          <div>{text}</div>
          {externalLink && (
            <span>
              <GoToIcon className="text-primary-400 mb-1 ml-2 inline h-4 w-4" />
            </span>
          )}
        </div>
      </button>
    </>
  )
}
