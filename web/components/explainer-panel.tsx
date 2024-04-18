import clsx from 'clsx'
import { Col } from './layout/col'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'
import React from 'react'
import { Row } from './layout/row'
import { FaHandHoldingUsd, FaPercentage } from 'react-icons/fa'
import { TbTargetArrow } from 'react-icons/tb'
import { track } from 'web/lib/service/analytics'
import { ManaCircleIcon } from 'web/components/icons/mana-circle-icon'
import { ENV_CONFIG, SPICE_PRODUCTION_ENABLED } from 'common/envs/constants'

export const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx(className)}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <Accuracy onClick={handleSectionClick} />
      <WhatAreOdds onClick={handleSectionClick} />
      <WhyShouldI onClick={handleSectionClick} />
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
    <Card className="mb-4">
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

const WhatAreOdds = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaPercentage className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        What are the odds?
      </Row>
    }
    onClick={() => onClick('What are the odds?')}
  >
    <div className="pb-2">The odds are the chance that the event happens.</div>
    <div className="pb-2">
      The odds are set by traders who have insight into the question weighted
      proportional to their confidence (bet size) and how correct they've been
      in the past (balance).
    </div>
  </ExpandSection>
)

const WhyShouldI = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <>
        <FaHandHoldingUsd className="mr-2" /> Why should I bet?
      </>
    }
    onClick={() => onClick('Why should I bet?')}
  >
    {SPICE_PRODUCTION_ENABLED && (
      <div className="pb-2">
        By betting, you can win prize points which are redeemable for real cash
        charity donations
      </div>
    )}
    <div className="pb-2">
      Betting on questions provides accurate answers of important real, world
      questions.
    </div>
    <div className="pb-2">Get started for free! No credit card required.</div>
  </ExpandSection>
)

const Accuracy = ({ onClick }: { onClick: (sectionTitle: string) => void }) => (
  <ExpandSection
    title={
      <>
        <TbTargetArrow className="mr-2" /> Are our forecasts accurate?
      </>
    }
    onClick={() => onClick('Are our forecasts accurate?')}
  >
    <div className="pb-2">
      Manifold is{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://manifold.markets/calibration"
      >
        very well calibrated
      </a>
      , with forecasts on average within <strong>4 percentage points</strong> of
      the true probability.
    </div>
    <div className="pb-2">
      By using the combined wisdom of thousands of users, we outperform
      real-money platforms. For example, in the{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
      >
        2022 US midterm elections
      </a>
      , we outperformed all prediction markets and were in line with
      FiveThirtyEight’s performance.
    </div>
    <div></div>
  </ExpandSection>
)
