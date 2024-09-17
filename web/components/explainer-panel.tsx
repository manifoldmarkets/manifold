import clsx from 'clsx'
import { Col } from './layout/col'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'
import React from 'react'
import { Row } from './layout/row'
import { FaHandHoldingUsd, FaPercentage } from 'react-icons/fa'
import { TbTargetArrow } from 'react-icons/tb'
import { track } from 'web/lib/service/analytics'
import {
  SWEEPIES_NAME,
  TRADE_TERM,
  TRADING_TERM,
  TWOMBA_ENABLED,
} from 'common/envs/constants'
import { capitalize } from 'lodash'
import { AboutManifold } from './about-manifold'
import { GoGraph } from 'react-icons/go'
import Link from 'next/link'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { SWEEPIES_MONIKER } from 'common/util/format'

export const ExplainerPanel = (props: {
  className?: string
  showWhatIsManifold?: boolean
  showAccuracy?: boolean
  showWhyBet?: boolean
  showSweepstakes?: boolean
}) => {
  const {
    className,
    showWhatIsManifold = true,
    showAccuracy = true,
    showWhyBet = true,
    showSweepstakes = true,
  } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx(className)}>
      {showWhatIsManifold && <WhatIsManifold onClick={handleSectionClick} />}
      {showAccuracy && <Accuracy onClick={handleSectionClick} />}
      {showWhyBet && <WhyBet onClick={handleSectionClick} />}
      {showSweepstakes && TWOMBA_ENABLED && (
        <Sweepstakes onClick={handleSectionClick} />
      )}
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
      <Row className="items-start">
        <FaPercentage className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        What is Manifold?
      </Row>
    }
    onClick={() => onClick('What is Manifold?')}
  >
    <AboutManifold />
  </ExpandSection>
)

const WhyBet = ({ onClick }: { onClick: (sectionTitle: string) => void }) => (
  <ExpandSection
    title={
      <>
        <FaHandHoldingUsd className="mr-2" /> Why should I {TRADE_TERM}?
      </>
    }
    onClick={() => onClick(`Why should I ${TRADE_TERM}?`)}
  >
    <div className="pb-2">
      {capitalize(TRADING_TERM)} contributes to accurate answers of important,
      real-world questions and helps you stay more accountable as you make
      predictions.
    </div>
    {TWOMBA_ENABLED && (
      <>
        <div className="pb-2">
          {capitalize(TRADE_TERM)} with{' '}
          <span className="coin-offset relative ml-[1.2em] whitespace-nowrap">
            <SweepiesCoin className="absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]" />
            <span className=" font-semibold text-amber-700 dark:text-amber-300 ">
              {' '}
              {SWEEPIES_NAME} ({SWEEPIES_MONIKER})
            </span>{' '}
          </span>
          for a chance to win withdrawable <b>cash prizes</b>.
        </div>
      </>
    )}

    <div className="pb-2">Get started for free! No credit card required.</div>
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
        <GoGraph className="mr-2" /> What are sweepstakes markets?
      </>
    }
    onClick={() => onClick('Are our forecasts accurate?')}
  >
    <div className="pb-2">
      There are two types of markets on Manifold: play money and sweepstakes.
    </div>
    <div className="pb-2">
      By default all markets are play money and use mana. These markets allow
      you to win more mana but do not award any prizes which can be cashed out.
    </div>
    <div className="pb-2">
      Selected markets will have a sweepstakes toggle. These require sweepcash
      to participate and allow winners to withdraw any sweepcash won to real
      money.
    </div>
    <div className="pb-2">
      As play money and sweepstakes markets are independent of each other, they
      may have different odds even though they share the same question and
      comments.
    </div>
    <Link
      href="https://docs.manifold.markets/sweepstakes"
      className="hover:text-primary-700 text-primary-600 hover:underline"
    >
      Learn more.
    </Link>
  </ExpandSection>
)
