import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ENV_CONFIG, TRADING_TERM } from 'common/envs/constants'
import React from 'react'
import { GoGraph } from 'react-icons/go'
import { TbTargetArrow } from 'react-icons/tb'
import { track } from 'web/lib/service/analytics'
import { AboutManifold } from './about-manifold'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { Card } from './widgets/card'

import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { formatMoney } from 'common/util/format'

export const ExplainerPanel = (props: {
  className?: string
  showWhatIsManifold?: boolean
  showAccuracy?: boolean
}) => {
  const { className, showWhatIsManifold = true, showAccuracy = true } = props
  const handleSectionClick = (sectionTitle: string) => {
    track('explainer section click', { sectionTitle })
  }
  return (
    <Col className={clsx('max-w-xl', className)}>
      {showWhatIsManifold && <WhatIsManifold onClick={handleSectionClick} />}
      {showAccuracy && <Accuracy onClick={handleSectionClick} />}
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

const PlayMoney = ({
  onClick,
}: {
  onClick: (sectionTitle: string) => void
}) => (
  <ExpandSection
    title={
      <>
        <ManaCoin className="!mr-2 h-4 w-4 grayscale" />
        Why use play money?
      </>
    }
    onClick={() => onClick('Why play money?')}
  >
    <div className="pb-2">
      Mana ({ENV_CONFIG.moneyMoniker}) is the play-money currency used to bet on
      Manifold. It cannot be converted to cash. All users start with{' '}
      {formatMoney(1000)} for free.
    </div>
    <div className="pb-2">
      Play money means it's much easier for anyone anywhere in the world to get
      started and try out forecasting without any risk. It also means there's
      more freedom to create and bet on any type of question.
    </div>
  </ExpandSection>
)
