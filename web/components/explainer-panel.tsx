import clsx from 'clsx'
import { Col } from './layout/col'
import { useState } from 'react'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'

export const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  return (
    <Col className={className}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <WhatIsAPM />
      <WhatIsMana />
      <WhyManifold />
    </Col>
  )
}

const ExpandSection = (props: { title: string; children: React.ReactNode }) => {
  const { title, children } = props
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card
      onClick={() => setIsExpanded((open) => !open)}
      className="mb-4 flex flex-col gap-2 px-4 py-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{title}</div>
        <ChevronDoubleDownIcon
          className={clsx(
            'ml-auto inline-block h-4 w-4 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>
      {isExpanded && <p className="text-ink-600">{children}</p>}
    </Card>
  )
}

const Break = () => <div className="my-2"></div>

export const WhatIsAPM = () => (
  <ExpandSection title="📈 What is a prediction market?">
    Prediction markets allow you to bet on the outcome of future events.
    <Break />
    The price of shares of an outcome varies as people buy and sell it. This
    then reflects the probability of the event occuring.
    <Break />
    Prediction markets, including ours, have proven to be incredibly accurate at
    estimating the correct odds.
  </ExpandSection>
)

export const WhatIsMana = () => (
  <ExpandSection title="💰 What is mana (Ṁ)?">
    • Mana (Ṁ) is the play-money used by our platform to keep track of your
    bets.
    <Break />
    • All users start with Ṁ500 for free and can earn more by winning bets and
    gaining free bonuses.
    <Break />• It cannot be converted to cash, but can be redeemed for real
    charity donations at a rate of Ṁ100 to $1.
  </ExpandSection>
)

export const WhyManifold = () => (
  <ExpandSection title="🤔 Why Manifold?">
    • <b>NEWS</b> - Build your understanding of current events with accurate
    probabilities rather than misleading media news engineered for engagement.
    <Break />• <b>COMPETE</b> with your friends and our vibrant community to win
    bets and progress up the leagues to earn prizes!
    <Break />• <b>ASK</b> - Anyone can create a question about anything they
    want!
  </ExpandSection>
)
