import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useState } from 'react'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'
import {
  WhatIsAPM,
  WhatIsMana,
  WhyManifold,
} from 'web/components/explainer-panel'
import { LabCard, LabSection } from './lab'

export default function AboutPage() {
  const { isNative, platform } = getNativePlatform()

  const isMobile = useIsMobile()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const appCallback = isMobile
    ? { href: isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL }
    : ({
        href: '#',
        onClick: (e: any) => {
          e.preventDefault()
          setIsModalOpen(true)
        },
      } as { href: string }) // typechecker is dumb

  const user = useUser()

  return (
    <Page trackPageView={'about page'}>
      <SEO title="About" description="About Manifold" />

      <Col className="p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg">
          Manifold is a play-money prediction market platform where you can bet
          on anything.
        </div>

        <Col className="w-full max-w-[60ch]">
          <WhatIsAPM />

          <WhatIsMana />

          <WhyManifold />

          <LabCard
            title="🙋‍♂️ Learn more in our FAQ"
            href="https://docs.manifold.markets/faq"
            target="_blank"
          />
        </Col>

        <Subtitle>🌎 Stay connected</Subtitle>
        <LabSection>
          {!isNative && (
            <>
              <MobileAppsQRCodeDialog
                isModalOpen={isModalOpen}
                setIsModalOpen={setIsModalOpen}
              />
              <LabCard
                title="📱 Mobile app"
                description="Download the iOS/Android app"
                {...appCallback}
              />
            </>
          )}
          <LabCard
            title="💬 Discord"
            href="https://discord.com/invite/eHQBNBqXuh"
            description="Chat with the community and team"
            target="_blank"
          />
          <LabCard
            title="📰 Newsletter"
            href="https://news.manifold.markets/"
            description="Get updates on new features and questions"
            target="_blank"
          />
          <LabCard
            title="🪺 Twitter"
            href="https://twitter.com/ManifoldMarkets"
            description="Follow us for updates and memes"
            target="_blank"
          />
          <LabCard
            title="✉️️ Email"
            href="mailto:info@manifold.markets"
            description="Contact us at info@manifold.markets for support"
          />
        </LabSection>

        <Subtitle>📄 Pages</Subtitle>
        <div className="grid gap-x-2 md:grid-cols-3">
          {user && (
            <LabCard
              title="🤗‍ Refer a friend"
              // description={`Earn ${formatMoney(REFERRAL_AMOUNT)}`}
              href="/referrals"
            />
          )}

          {user && (!isNative || (isNative && platform !== 'ios')) && (
            <LabCard title="💰 Get Mana" href="/add-funds" />
          )}
          {user && <LabCard title="💸 Send mana" href="/payments" />}
          <LabCard title="⚡️ Live feed" href="/live" />
          <LabCard title="🏆 Leaderboards" href="/leaderboards" />
          <LabCard title="️🔖 Dashboards" href="/dashboard" />
        </div>

        <LabSection>
          <LabCard
            title="📜 Community guidelines"
            description="General expectations and account rules"
            href="https://manifoldmarkets.notion.site/Community-Guidelines-f6c77b1af41749828df7dae5e8735400"
          />
          <LabCard
            title="📏 Platform calibration"
            description="Manifold's overall track record"
            href="/calibration"
          />

          {(!isNative || (isNative && platform !== 'ios')) && (
            <LabCard
              title="🫀 Charity"
              description={`Turn mana into real charitable donations`}
              href="/charity"
            />
          )}
          {/* TODO: replace with another page to be even. or remove one */}
          <LabCard title="🐮 Moolinda" description="???" href="/cowp" />
        </LabSection>

        <Spacer h={8} />
      </Col>
      <PrivacyTermsLab />
    </Page>
  )
}
