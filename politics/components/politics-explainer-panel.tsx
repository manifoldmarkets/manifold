import { Col } from 'web/components/layout/col'
import { ExpandSection } from 'web/components/explainer-panel'
import { TbTargetArrow } from 'react-icons/tb'

import { FaPercentage, FaHandHoldingUsd } from 'react-icons/fa'

import clsx from 'clsx'

export const PoliticsExplainerPanel = (props: {
  className?: string
  header?: string
}) => {
  const { className, header } = props
  return (
    <div className={className}>
      <Col className="mx-auto ">
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
