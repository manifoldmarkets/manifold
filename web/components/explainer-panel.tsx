import clsx from 'clsx'
import { Col } from './layout/col'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'
import React from 'react'
import { Row } from './layout/row'
import { FaHandHoldingUsd, FaPercentage } from 'react-icons/fa'
import { TbTargetArrow } from 'react-icons/tb'

export const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  return (
    <div className={className}>
      <Col className="mx-auto max-w-[60ch]">
        <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
        <WhatIsAPM />
        <WhatIsMana />
        <WhyManifold />
      </Col>
    </div>
  )
}

export const ExpandSection = (props: {
  title: React.ReactNode
  children: React.ReactNode
}) => {
  const { title, children } = props

  return (
    <Card className="mb-4">
      <details className="group flex flex-col gap-2">
        <summary className="flex list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <Row className="items-center text-lg font-semibold">{title}</Row>
          <span className="ml-auto inline-block h-4 w-4 flex-shrink-0">
            <ChevronDoubleDownIcon
              className="h-full w-full transition group-open:-rotate-180"
              aria-hidden
            />
          </span>
        </summary>
        <div className="text-ink-900 px-4 pb-3">{children}</div>
      </details>
    </Card>
  )
}

const Caps = (props: { children: React.ReactNode }) => (
  <span className="font-bold uppercase">{props.children}</span>
)

export const WhatIsAPM = () => (
  <ExpandSection
    title={
      <Row className="items-start">
        <FaPercentage className="mr-2 mt-[0.25em] flex-shrink-0 align-text-bottom" />{' '}
        How are the probabilities generated?
      </Row>
    }
  >
    <div className="pb-2">
      We use prediction markets, which function differently from polls and
      models.
    </div>
    <div className="pb-2">
      Users buy Yes or No shares to change the odds of an answer. The odds are
      reflected in the market price changing how much Yes and No cost. Buying
      pressure on each side causes the market to converge to a price that
      accurately forecasts the future.
    </div>
    It’s like combining the accuracy of sports betting and the stock market and
    using it to answer questions.
  </ExpandSection>
)

export const WhatIsMana = () => (
  <ExpandSection
    title={
      <>
        <FaHandHoldingUsd className="mr-2" /> How do I bet?
      </>
    }
  >
    <div className="pb-2">
      All users start with free mana (Ṁ), the play-money used to bet on
      Manifold.
    </div>
    <div className="pb-2">
      You can use this to place bets. Earn more mana by selling a bet early for
      a higher price than you bought or wait for it to conclude and win.
    </div>
    Mana can’t be redeemed for cash and is not crypto.
  </ExpandSection>
)

export const WhyManifold = () => (
  <ExpandSection
    title={
      <>
        <TbTargetArrow className="mr-2" /> Is Manifold accurate?
      </>
    }
  >
    <div className="pb-2">
      Manifold has built a reputable track record and has {''}
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://manifold.markets/calibration"
      >
        exceptionally good calibration
      </a>
      .
    </div>
    <div className="pb-2">
      We outperformed all real-money prediction markets and were in line with
      Nate Silver’s FiveThirtyEight’s performance when
      <a
        className="text-primary-700 hover:underline"
        target="_blank"
        href="https://firstsigma.substack.com/p/midterm-elections-forecast-comparison-analysis"
      >
        {''} forecasting the 2022 US midterm elections
      </a>
      .
    </div>
    <div>
      Our biggest advantage is being able to apply this accuracy to a wider
      range of questions with real-time odds that instantly react to the news!
    </div>
  </ExpandSection>
)
