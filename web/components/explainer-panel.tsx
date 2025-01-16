import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { CHARITY_FEE, SWEEPIES_NAME, TRADING_TERM } from 'common/envs/constants'
import Link from 'next/link'
import React from 'react'
import { GoGraph } from 'react-icons/go'
import { TbTargetArrow } from 'react-icons/tb'
import { track } from 'web/lib/service/analytics'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { AboutManifold } from './about-manifold'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Card } from './widgets/card'

import { GiTakeMyMoney } from 'react-icons/gi'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { TokenNumber } from './widgets/token-number'

export const ExplainerPanel = (props: {
  className?: string
  showWhatIsManifold?: boolean
  showAccuracy?: boolean
  showSweepstakes?: boolean
}) => {
  const {
    className,
    showWhatIsManifold = true,
    showAccuracy = true,
    showSweepstakes = true,
  } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx(className)}>
      {showWhatIsManifold && <WhatIsManifold onClick={handleSectionClick} />}
      {showAccuracy && <Accuracy onClick={handleSectionClick} />}
      {showSweepstakes && <Sweepstakes onClick={handleSectionClick} />}
    </Col>
  )
}

export const ExpandSection = (props: {
  title: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}) => {
  const { title, children, onClick } = props

  return (
    <Card className="my-2">
      <details className="group flex flex-col gap-2">
        <summary className="flex list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <Row className="items-center text-lg font-semibold">{title}</Row>
          <span className="ml-auto inline-block h-4 w-4 flex-shrink-0">
            <ChevronDoubleDownIcon
              className="h-full w-full transition group-open:-rotate-180"
              aria-hidden
              onClick={onClick}
            />
          </span>
        </summary>
        <div className="text-ink-900 px-4 pb-3">{children}</div>
      </details>
    </Card>
  )
}

const WhatIsManifold = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <>
        <GoGraph className="mr-2  " /> What is Manifold?
      </>
    }
    onClick={() => onClick('What is Manifold?')}
  >
    <AboutManifold />
  </ExpandSection>
)

const Accuracy = ({ onClick }: { onClick: (sectionTitle: string) => void }) => (
  <ExpandSection
    title={
      <>
        <TbTargetArrow className="mr-2" /> Are our predictions accurate?
      </>
    }
    onClick={() => onClick('Are our forecasts accurate?')}
  >
    <div className="pb-2">
      Yes! Manifold is{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://manifold.markets/calibration"
      >
        very well calibrated
      </a>
      , with forecasts on average within <strong>4 percentage points</strong> of
      the true probability. Our probabilities are created by users buying and
      selling shares of a market.
    </div>
    <div className="pb-2">
      In the 2022 US midterm elections, we {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
      >
        outperformed all other prediction market platforms {''}
      </a>
      and were in line with FiveThirtyEight’s performance. Many people who don't
      like {TRADING_TERM} still use Manifold to get reliable news.
    </div>
    <div></div>
  </ExpandSection>
)

const Sweepstakes = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <>
        <GiTakeMyMoney className="mr-2" /> How do I win cash prizes?
      </>
    }
    onClick={() => onClick('Are our forecasts accurate?')}
  >
    <div className="pb-2">
      Manifold offers two market types: play money and sweepstakes.
    </div>
    <div className="pb-2">
      All questions include a play money market which uses mana <ManaCoin /> and
      can't be cashed out.
    </div>
    <div className="pb-2">
      Selected markets will have a sweepstakes toggle. These require sweepcash{' '}
      <SweepiesCoin />
      &nbsp;to participate and winners can withdraw sweepcash as a cash prize.
      You can filter for sweepstakes markets on the browse page.
    </div>
    <div className="pb-2">
      Redeem your {SWEEPIES_NAME} won from markets at{' '}
      <b>
        <TokenNumber amount={1} coinType="sweepies" isInline={true} /> {'→'}{' '}
        $1.00
      </b>
      , minus a {CHARITY_FEE * 100}% fee.
    </div>

    <Link
      href="https://docs.manifold.markets/sweepstakes"
      className="hover:text-primary-700 text-primary-600 hover:underline"
    >
      Learn more.
    </Link>
  </ExpandSection>
)
