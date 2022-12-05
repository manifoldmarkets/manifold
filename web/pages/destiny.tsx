import { useState } from 'react'
import { CheckmarkIcon } from 'react-hot-toast'
import Image from 'next/image'

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
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { usePrivateUser } from 'web/hooks/use-user'
import { claimDestinySub } from 'web/lib/firebase/api'

export default function DestinyLandingPage() {
  useSaveReferral()
  useTracking('view destiny landing page')

  const trendingContracts = useTrendingContracts(6, [
    'groupLinks.slug:destinygg',
  ])

  const [destinyUsername, setDestinyUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const privateUser = usePrivateUser()

  const destinySubClaimed = privateUser?.destinySubClaimed ?? false

  const submit = async () => {
    if (!destinyUsername) return

    setIsSubmitting(true)
    setError('')

    await claimDestinySub({ destinyUsername }).catch((err) => {
      setError(err.message)
      setIsSubmitting(false)
    })
  }

  return (
    <Page>
      <SEO
        title="Destiny on Manifold"
        description="Get more out of Twitch with play-money betting markets."
      />

      <Col className="max-w-3xl rounded bg-white p-4 text-gray-600 shadow-md sm:mx-auto sm:p-10">
        <Title>Claim a free Destiny tier-1 subscription!</Title>

        <div>
          Support Destiny by trading in our markets to earn {formatMoney(1000)}{' '}
          and claim your sub. It's free and you can sign up with google
          instantly. For each subscription, Manifold Markets will pay Destiny
          $5.00 on your behalf!
        </div>
        <Row className="hidden items-center px-4 sm:flex">
          <Image src="/dgg-logo.svg" alt="Destiny" height={50} width={200} />
          <div className="mx-8 text-4xl">+</div>
          <Image src="/logo.png" alt="Manifold" width={150} height={100} />
        </Row>
        <div className="mt-4 sm:mt-0">
          Once you have the required balance, simply enter the destiny.gg
          account name you want the sub gifted to. You may only claim one sub.
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
              disabled={isSubmitting}
              value={destinyUsername}
              onChange={(e) => setDestinyUsername(e.target.value)}
            />
            <Button
              color="gradient-pink"
              disabled={isSubmitting}
              loading={isSubmitting}
              onClick={submit}
            >
              Claim now
            </Button>
          </Row>
        )}
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        <Spacer h={8} />
        <Subtitle text="New to Manifold Markets?" />
        <LandingPagePanel />
        <Spacer h={8} />
        <Subtitle text="Trending markets" />
        {trendingContracts ? (
          <ContractsGrid
            contracts={trendingContracts}
            showImageOnTopContract={true}
          />
        ) : (
          <LoadingIndicator />
        )}
        <TestimonialsPanel />
      </Col>
    </Page>
  )
}
