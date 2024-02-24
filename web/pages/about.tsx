import { useState } from 'react'
import Link from 'next/link'
import {
  MailIcon,
  NewspaperIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/outline'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandTwitter,
} from 'react-icons/tb'

import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
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
import { LabCard } from './lab'

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
      <SEO
        title="About"
        description="Manifold is the world's largest prediction market platform. Bet on politics,
          tech, sports, and more. Or create your own play-money market."
      />

      <Col className="p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg">
          Manifold is the world's largest prediction market platform. Bet on
          politics, tech, sports, and more. Or create your own play-money
          betting market on any topic you care about!
        </div>

        <iframe
          src="https://www.youtube.com/embed/DB5TfX7eaVY?start=9"
          className="mb-4 h-80 w-full max-w-2xl"
        ></iframe>

        <Col className="mt-8 w-full">
          <WhatIsAPM />

          <WhatIsMana />

          <WhyManifold />
        </Col>

        <MobileAppsQRCodeDialog
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        <div className="my-6 grid grid-cols-2 justify-between sm:grid-cols-3 md:flex">
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
            Icon={QuestionMarkCircleIcon}
            href="https://docs.manifold.markets/faq"
            target="_blank"
          >
            FAQ
          </SocialLink>
        </div>

        <div className="mt-4 grid gap-x-2 md:grid-cols-3">
          {user && (!isNative || (isNative && platform !== 'ios')) && (
            <LabCard title="💰 Get mana" href="/add-funds" />
          )}
          {user && <LabCard title="🤗‍ Refer a friend" href="/referrals" />}
          {user && <LabCard title="💸 Send mana" href="/payments" />}
          <LabCard title="🎯 Calibration & track record" href="/calibration" />
          <LabCard title="🏆 Leaderboards" href="/leaderboards" />
          <LabCard
            title="📜 Community guidelines"
            href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
          />
          <LabCard
            title="👑 Creator Partner Program"
            description="Earn real money by creating interesting questions."
            href="/partner-explainer"
          />

          <LabCard
            title="🦋 Changelog"
            href="https://manifoldmarkets.notion.site/Changelog-da5b4fe95872484f8fa4ee5cc71806d8"
          />

          {(!isNative || (isNative && platform !== 'ios')) && (
            <LabCard title="🫀 Charity" href="/charity" />
          )}

          <LabCard title="⚡️ Live feed" href="/live" />
          <LabCard title="️🔖 Dashboards" href="/dashboard" />
          <LabCard title="️🧪 Lab" href="/lab" />
          <LabCard
            title="❤️ Manifold.love"
            href="https://manifold.love"
            target="_blank"
          />
          <LabCard
            title="️💘 Bet on Love"
            href="https://www.youtube.com/watch?v=mEF0S1qOsFI"
            target="_blank"
          />
          <LabCard
            title="️🎊 Manifest"
            href="https://www.manifest.is/"
            target="_blank"
          />
        </div>
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
      className="bg-canvas-0 text-ink-800 hover:text-primary-800 hover:bg-primary-100 flex items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 font-semibold transition-colors"
    >
      <Icon className="h-6 w-6" />
      {children}
    </Link>
  )
}
