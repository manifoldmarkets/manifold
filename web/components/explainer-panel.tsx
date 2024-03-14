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
import { ENV_CONFIG } from 'common/envs/constants'

export const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx(' max-w-[60ch]', className)}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <Accuracy onClick={handleSectionClick} />
      <WhatAreOdds onClick={handleSectionClick} />
      <WhyShouldI onClick={handleSectionClick} />
      <PlayMoney onClick={handleSectionClick} />
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
    <div className="pb-2">
      Betting on questions provides decision-makers with accurate predictions of
      the future.
    </div>
    <div className="pb-2">
      It’s like combining the accuracy of sports betting and the stock market to
      answer important, real-world questions.
    </div>
  </ExpandSection>
)
const PlayMoney = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <>
        <ManaCircleIcon className="mr-2 h-4 w-4" />
        Why use play money?
      </>
    }
    onClick={() => onClick('Why play money?')}
  >
    <div className="pb-2">
      Our play money, ({ENV_CONFIG.moneyMoniker}) is free to get started with
      and produces better forecasts.
    </div>
    <div className="pb-2">
      It's just one click to sign up and start forecasting. Plus, you can cash
      out your winnings to charity!
    </div>
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
      By using play money and the combined wisdom of thousands of users, we
      outperform real-money platforms. For example, in the{' '}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
      >
        2022 US midterm elections
      </a>
      , we outperformed all real-money prediction markets and were in line with
      FiveThirtyEight’s performance.
    </div>
    <div></div>
  </ExpandSection>
)
