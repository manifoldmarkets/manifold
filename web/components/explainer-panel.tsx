import clsx from 'clsx'
import { Col } from './layout/col'
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
        <p className="text-ink-600 px-4 pb-3">{children}</p>
      </details>
    </Card>
  )
}

const Break = () => <div className="my-2" />

const Caps = (props: { children: React.ReactNode }) => (
  <span className="font-bold uppercase">{props.children}</span>
)

export const WhatIsAPM = () => (
  <ExpandSection title="📈 What is a prediction market?">
    Prediction markets let you bet on the outcome of future events.
    <Break />
    The price of shares in an outcome vary as people buy and sell it. This
    reflects the probability of the event occuring.
    <Break />
    Prediction markets, including ours, have proven to be incredibly accurate at
    estimating the correct odds.
  </ExpandSection>
)

export const WhatIsMana = () => (
  <ExpandSection title="💰 What is mana (Ṁ)?">
    • Mana (Ṁ) is the play-money used by to bet on our platform.
    <Break />
    • All users start with Ṁ500 for free and can earn more by winning bets and
    gaining free bonuses.
    <Break />• Most of our users never spend real money!
    <Break />• It cannot be converted to cash, but can be redeemed for real
    charity donations at a rate of Ṁ100 to $1.
  </ExpandSection>
)

export const WhyManifold = () => (
  <ExpandSection title="🤔 Why Manifold?">
    • <Caps>News</Caps> - Build a deep understanding of current events with
    precise probabilities, not sensationalist media.
    <Break />• <Caps>Compete</Caps> with your friends and our vibrant community
    to win bets and progress up the leagues to earn prizes!
    <Break />• <Caps>Ask</Caps> - Create a question about anything you want!
    <Break />• <Caps>Resolve</Caps> - Users who create a question are
    responsible for choosing the outcome. This allows scalability and personal
    questions! Our admins may step in if a market is misresolved.
  </ExpandSection>
)
