import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useState } from 'react'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'
import { WhatIsAPM, WhatIsMana } from 'web/components/explainer-panel'
import Link from 'next/link'
import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandGithub,
  TbBrandTwitter,
} from 'react-icons/tb'
import { LovePage } from 'love/components/love-page'

export default function AboutPage() {
  const { isNative } = getNativePlatform()

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

  return (
    <LovePage trackPageView={'about page'}>
      <SEO title="About" description="About Manifold.love" />

      <Col className="p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg">
          Manifold.love is the first dating app where your{' '}
          <span className="font-semibold">long term matches</span> are forecast
          by the wisdom of the crowd using play-money{' '}
          <span className="font-semibold">prediction markets</span>!
        </div>

        <Col className="w-full max-w-[60ch]">
          <WhatIsAPM />

          <WhatIsMana />
        </Col>

        <div className="my-2 text-lg font-semibold">How does it work?</div>

        <div className="mb-4 text-lg">
          Review user profiles and bet on matches you predict will last 6
          months. If you are right, you will earn a profit.
        </div>
        <div className="mb-4 text-lg">
          But more importantly, you will be helping to crowdsource matchmaking!
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
            href="https://discord.com/invite/eHQBNBqXuh"
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
