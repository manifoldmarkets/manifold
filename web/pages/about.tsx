import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useState } from 'react'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
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
import Link from 'next/link'
import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandGithub,
  TbBrandTwitter,
} from 'react-icons/tb'

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

        <Col className="w-full">
          <iframe
            src="https://www.youtube.com/embed/DB5TfX7eaVY?start=9"
            className="mb-4 h-80 max-w-2xl"
          ></iframe>
          <WhatIsAPM />

          <WhatIsMana />

          <WhyManifold />

          <LabCard
            title="🎯 Manifold Accuracy and Track Record"
            description="Why you should trust Manifold"
            href="/calibration"
          />

          <LabCard
            title="🙋‍♂️ Learn more in our FAQ"
            href="https://docs.manifold.markets/faq"
            target="_blank"
          />
        </Col>

        <MobileAppsQRCodeDialog
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        <div className="mb-6 mt-2 grid grid-cols-2 justify-between sm:grid-cols-3 md:flex">
          {!isNative && (
            <SocialLink
              Icon={!isMobile || isIOS() ? TbBrandApple : TbBrandAndroid}
              {...appCallback}
            >
              Mobile App
            </SocialLink>
          )}
          <SocialLink
            Icon={TbBrandDiscord}
            href="https://discord.com/invite/eHQBNBqXuh"
            target="_blank"
          >
            Discord
          </SocialLink>
          <SocialLink
            Icon={NewspaperIcon}
            href="https://news.manifold.markets"
            target="_blank"
          >
            Newsletter
          </SocialLink>
          <SocialLink
            Icon={TbBrandTwitter}
            href="https://twitter.com/ManifoldMarkets"
            target="_blank"
          >
            Twitter
          </SocialLink>
          <SocialLink
            Icon={MailIcon}
            href="mailto:info@manifold.markets"
            target="_blank"
          >
            Email
          </SocialLink>
          <SocialLink
            Icon={TbBrandGithub}
            href="https://github.com/manifoldmarkets/manifold"
            target="_blank"
          >
            Github
          </SocialLink>
        </div>

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
            href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
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

          <LabCard
            title="❤️ Manifold.love"
            description="Dating meets prediction markets"
            href="https://manifold.love"
            target="_blank"
          />
        </LabSection>
      </Col>
      <PrivacyTermsLab />
    </Page>
  )
}

const SocialLink = (props: {
  href: string
  onClick?: () => void
  Icon: any
  children: React.ReactNode
  target?: string
}) => {
  const { href, onClick, Icon, children, target } = props
  return (
    <Link
      href={href}
      onClick={onClick}
      target={target}
      className="text-ink-800 hover:text-primary-800 hover:bg-primary-100 flex items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 transition-colors"
    >
      <Icon className="h-6 w-6" />
      {children}
    </Link>
  )
}
