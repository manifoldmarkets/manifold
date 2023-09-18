import { useState } from 'react'
import { CheckmarkIcon } from 'react-hot-toast'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { formatMoney } from 'common/util/format'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Spacer } from 'web/components/layout/spacer'
import { TestimonialsPanel } from 'web/components/testimonials-panel'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { claimDestinySub } from 'web/lib/firebase/api'
import { Contract } from 'common/contract'
import { searchContract } from 'web/lib/supabase/contracts'
import { getTotalSubs } from 'web/lib/firebase/utils'
import { WhatIsMana } from 'web/components/explainer-panel'
import { LabCard } from './about'

export async function getStaticProps() {
  const subCount = await getTotalSubs()

  const trendingContracts = (
    await searchContract({
      query: '',
      filter: 'open',
      sort: 'score',
      limit: 6,
      topicSlug: 'destinygg',
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
}) {
  const { subCount, trendingContracts } = props

  useSaveReferral()

  const [destinyUsername, setDestinyUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const privateUser = usePrivateUser()
  const user = useUser()

  const destinySubClaimed = privateUser?.destinySub2Claimed ?? false

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
    <Page trackPageView={'destiny landing page'}>
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
          subCount < 1000 && (
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
          )
        )}
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        <div className="mt-4 pt-6 sm:mt-0">
          Total subs claimed: {subCount + (isSuccess ? 1 : 0)} / 1,000
        </div>

        <Spacer h={2} />
        <Subtitle>New to Manifold?</Subtitle>
        <Col className="max-w-3xl">
          <LabCard
            title="📖 Welcome explanation"
            href="https://manifold.markets/post/welcome-explanation-for-newcomers-f"
            target="_blank"
          />
          <WhatIsMana />
          <LabCard
            title="📈 All Dgg stocks"
            href="https://manifold.markets/questions?topic=destinygg"
          />
        </Col>

        <Spacer h={4} />
        <Subtitle>Trending questions</Subtitle>
        <ContractsGrid contracts={trendingContracts} />
        <TestimonialsPanel />
      </Col>
    </Page>
  )
}
