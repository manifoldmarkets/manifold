import clsx from 'clsx'
import { Col } from './layout/col'
import { ChevronDoubleDownIcon } from '@heroicons/react/solid'
import { Card } from './widgets/card'

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
  title: string
  children: React.ReactNode
}) => {
  const { title, children } = props

  return (
    <Card className="mb-4">
      <details className="group flex flex-col gap-2">
        <summary className="flex list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <div className="text-lg font-semibold">{title}</div>
          <ChevronDoubleDownIcon
            className="ml-auto inline-block h-4 w-4 transition group-open:-rotate-180"
            aria-hidden
          />
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
  <ExpandSection title="📈 What is a prediction market?">
    Prediction markets let you bet on future events.
    <br />
    The price of an outcome reflects the odds of that outcome, which varies as
    people buy and sell.
    <br />
    Manifold's probabilities are very accurate at forecasting the future!
  </ExpandSection>
)

export const WhatIsMana = () => (
  <ExpandSection title="💰 What is mana (Ṁ)?">
    Mana (Ṁ) is the play-money used to bet on Manifold.
    <br />
    You start with Ṁ500 for free. Earn more by winning bets and gaining bonuses.
    <br />
    Most users never have to buy mana!
    <br />
    Mana can't be redeemed for cash, but you can donate it to charity at a rate
    of $1 per Ṁ100.
  </ExpandSection>
)

export const WhyManifold = () => (
  <ExpandSection title="🤔 Why Manifold?">
    • <Caps>News</Caps> - Understand current events with precise probabilities,
    not sensationalist media.
    <br />• <Caps>Compete</Caps> - Progress up the leagues to earn prizes!
    <br />• <Caps>Ask</Caps> - Create a question about anything you want!
    <br />• <Caps>Venture</Caps> - You judge the outcome of questions you write.
    Because you're not just a user. You're a creator. An entrepreneur. A
    business. Your bettors are customers. Your reputation is on the line. But if
    you ask questions people love, you will earn a lot of mana!
  </ExpandSection>
)
