'use client'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { useState } from 'react'
import { MobileAppsQRCodeDialog } from 'web/components/buttons/mobile-apps-qr-code-button'
import { Col } from 'web/components/layout/col'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { PrivacyTermsLab } from 'web/components/privacy-terms'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useUser } from 'web/hooks/use-user'
import { getNativePlatform } from 'web/lib/native/is-native'
import { isIOS } from 'web/lib/util/device'
import { ExpandSection } from 'web/components/explainer-panel'
import { LabCard } from 'web/pages/lab'
import Link from 'next/link'
import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandGithub,
  TbBrandTwitter,
  TbTargetArrow,
  TbGraph,
} from 'react-icons/tb'
import { FaHandHoldingUsd, FaPercentage } from 'react-icons/fa'
import { PoliticsPage } from 'politics/components/politics-page'
import clsx from 'clsx'

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
    <PoliticsPage trackPageView={'about page'}>
      <SEO title="About" description="About Manifold" />

      <Col className="p-4">
        <Title className="hidden sm:flex">About</Title>
        <ManifoldLogo className="mb-4 flex sm:hidden" />

        <div className="mb-4 text-lg">
          Manifold Politics is a play-money prediction market platform where you
          can follow the news and bet on a wide range of political questions.
        </div>

        <Col className="w-full">
          <PoliticsExplainerPanel />
          <ExpandSection
            title={
              <>
                <TbGraph className="mr-2" /> Can I make my own
                questions/markets?
              </>
            }
          >
            No, not on manifold.politics.
            <br />
            However, our main site,
            <a
              className="text-primary-700 hover:underline"
              href="https://manifold.markets"
            >
              Manifold Markets
            </a>
            , does allow you to make your own markets. You can make a question
            about anything you want to and have other users bet on it.
          </ExpandSection>
        </Col>

        <MobileAppsQRCodeDialog
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
        />

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
          <LabCard
            title="📜 Community guidelines"
            href="https://manifoldmarkets.notion.site/New-WIP-Community-Guidelines-2b986d33f0c646478d4921667c272f21"
          />
        </div>

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

        <iframe
          src="https://www.youtube.com/embed/DB5TfX7eaVY?start=9"
          className="mb-4 h-80 max-w-2xl"
        ></iframe>
      </Col>
      <PrivacyTermsLab />
    </PoliticsPage>
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

export const PoliticsExplainerPanel = (props: {
  className?: string
  header?: string
}) => {
  const { className, header } = props
  return (
    <div className={className}>
      <Col className="mx-auto max-w-[60ch]">
        <h2 className={clsx('text-ink-600 mb-2 text-xl')}>{header}</h2>
        <ExpandSection
          title={
            <>
              <TbTargetArrow className="mr-2" /> Is Manifold Politics accurate
            </>
          }
        >
          Manifold has built a reputable track record and has {''}
          <a
            className="text-primary-700 hover:underline"
            target="_blank"
            href="https://manifold.markets/calibration"
          >
            exceptionally good calibration
          </a>
          .
          <br />
          We outperformed all real-money prediction markets and were in line
          with Nate Silver’s FiveThirtyEight’s performance when
          <a
            className="text-primary-700 hover:underline"
            target="_blank"
            href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
          >
            {''} forecasting the 2022 US midterm elections
          </a>
          .
          <br />
          Our biggest advantage is being able to apply this accuracy to a wider
          range of questions with real-time odds that instantly react to the
          news!
        </ExpandSection>
        <ExpandSection
          title={
            <>
              <FaPercentage className="mr-2" /> How are our probabilities
              generated using prediction markets?
            </>
          }
        >
          We use prediction markets, which function differently from polls and
          models.
          <br />
          Users buy Yes or No shares to change the odds of an answer. The odds
          are reflected in the market price changing how much Yes and No cost.
          Buying pressure on each side causes the market to converge to a price
          that accurately forecasts the future.
          <br />
          It’s a little like combining the accuracy of sports betting and the
          stock market and applying it to predicting politics!
        </ExpandSection>
        <ExpandSection
          title={
            <>
              <FaHandHoldingUsd className="mr-2" /> How can I bet?
            </>
          }
        >
          All users start with free Mana (Ṁ$), the play-money used to bet on
          Manifold Politics.
          <br />
          You can use this to place bets. Earn more Mana by selling a bet early
          for a higher price than you bought or wait for it to conclude and win.
          <br />
          Mana can’t be redeemed for cash and is not crypto.
        </ExpandSection>
      </Col>
    </div>
  )
}
