import Link from 'next/link'
import { useState } from 'react'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { WhatIsAPM, WhatIsMana } from 'web/components/explainer-panel'
import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import { TbBrandDiscord, TbBrandGithub, TbBrandTwitter } from 'react-icons/tb'
import { LovePage } from 'love/components/love-page'
import ManifoldLoveLogo from 'love/components/manifold-love-logo'

export default function AboutPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <LovePage trackPageView={'about page'}>
      <SEO title="About" description="About Manifold.love" />

      <Col className="p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLoveLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg">
          Find your long term match through human matchmaking & prediction
          markets.
        </div>
        <div className="mb-4 text-lg">
          Manifold.love is the first dating app where your matches are chosen by
          other users trading on play-money prediction markets!
        </div>

        <Col className="w-full max-w-[60ch]">
          <WhatIsAPM />

          <WhatIsMana />
        </Col>

        <div className="my-2 text-lg font-semibold">How does it work?</div>

        <div className="mb-2 text-lg">
          <span className="font-semibold">1.</span> Browse user profiles.{' '}
        </div>
        <div className="mb-2 text-lg">
          <span className="font-semibold">2.</span> Bet on potential matches.{' '}
        </div>
        <div className="mb-2 text-lg">
          <span className="font-semibold">3.</span> See your top matches.
        </div>
        <div className="mb-2 text-lg">
          If two users end up dating for 6 months, those who bet on it win
          currency. It's fun!
        </div>
        <div className="mb-2 text-lg">
          But most importantly, we are collectively curating the best long term
          relationships.
        </div>

        <MobileAppsQRCodeDialog
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

        <div className="mb-6 mt-2 grid grid-cols-2 justify-between sm:grid-cols-3 md:flex">
          {/* {!isNative && (
            <SocialLink
              Icon={!isMobile || isIOS() ? TbBrandApple : TbBrandAndroid}
              {...appCallback}
            >
              Mobile App
            </SocialLink>
          )} */}
          <SocialLink
            Icon={TbBrandDiscord}
            href="https://discord.gg/nu27NceaEU"
          >
            Discord
          </SocialLink>
          <SocialLink Icon={NewspaperIcon} href="https://news.manifold.markets">
            Newsletter
          </SocialLink>
          <SocialLink
            Icon={TbBrandTwitter}
            href="https://twitter.com/ManifoldMarkets"
          >
            Twitter
          </SocialLink>
          <SocialLink Icon={MailIcon} href="mailto:love@manifold.markets">
            Email
          </SocialLink>
          <SocialLink
            Icon={TbBrandGithub}
            href="https://github.com/manifoldmarkets/manifold"
          >
            Github
          </SocialLink>
        </div>
        <Spacer h={8} />
      </Col>
      <PrivacyTermsLab />
    </LovePage>
  )
}

const SocialLink = (props: {
  href: string
  onClick?: () => void
  Icon: any
  children: React.ReactNode
}) => {
  const { href, onClick, Icon, children } = props
  return (
    <Link
      href={href}
      onClick={onClick}
      className="text-ink-800 hover:text-primary-800 hover:bg-primary-100 flex items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 transition-colors"
    >
      <Icon className="h-6 w-6" />
      {children}
    </Link>
  )
}
