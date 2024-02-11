import { useState, ReactNode } from 'react'
import Router from 'next/router'

import { LOVE_MARKET_COST } from 'common/love/constants'
import { formatMoney } from 'common/util/format'
import { LovePage } from 'love/components/love-page'
import { SEO } from 'web/components/SEO'
import { Button } from 'web/components/buttons/button'
import { BuyManaButton } from 'web/components/buy-mana-button'
import { BackButton } from 'web/components/contract/back-button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Title } from 'web/components/widgets/title'
import { api } from 'web/lib/firebase/api'
import { useUser } from 'web/hooks/use-user'

export default function CreateYourDatingMarket() {
  const user = useUser()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setIsSubmitting(true)
    await api('create-your-love-market', {})
      .then(() => {
        Router.push(`/${user?.username}`)
      })
      .catch((e) => {
        setError(e.message)
      })
    setIsSubmitting(false)
  }

  const hasEnoughMana = user && user.balance >= LOVE_MARKET_COST

  return (
    <LovePage trackPageView={'create-your-dating-market'}>
      <SEO
        title="Your dating prediction market"
        description="Set up a prediction market to forecast your top matches by probability of going on 3 dates with you."
      />

      <BackButton className="self-start" />
      <Col className="bg-canvas-0 border-ink-100 max-w-xl gap-4 self-center border shadow sm:mb-6 sm:rounded-lg">
        <Title className="mx-5 !mb-0 mt-4 !text-4xl sm:text-3xl">
          Your dating prediction market
        </Title>

        <div className="mx-5 text-lg font-semibold">
          Find your match through the wisdom of the crowds.
        </div>

        <Section title={'How does it work?'}>
          <div>
            We'll set up a market with the question: "Who will I next go on 3
            dates with?" with your payment as a bounty.
          </div>
          <div>
            Third party traders can then bet on it to win Mana, our play-money
            currency.
          </div>
        </Section>

        <Section title={'How do I benefit?'}>
          <div>
            Save time by asking out candidates with the highest probability of
            going on 3 dates with you.
          </div>
          <div>
            The market will also increase your visibility and could persuade
            people to date you. ("Hey babe. The market says our odds are good!")
          </div>
        </Section>

        <Section title={'Will I need to do anything?'}>
          <div>
            There's only one thing you need to do — once you've gone on 3 dates
            with someone, you must confirm that within this app. The market will
            then resolve. (Only dates arranged through Manifold Love are
            applicable.)
          </div>
        </Section>

        <Section title={'Money back guarantee'}>
          <div>
            If you don't go on any 3rd dates in 6 months through this app,
            you'll automaticallly get a full refund in mana. Email us to get the
            refund in USD.
          </div>
          <div>We believe in aligning incentives!</div>
        </Section>

        <Row className="w-full items-end justify-center">
          <Col className="items-center gap-2 self-end p-4">
            <div className="text-ink-500 text-2xl font-semibold">
              Give it a shot:
            </div>

            {hasEnoughMana ? (
              <Button
                disabled={isSubmitting}
                loading={isSubmitting}
                onClick={submit}
              >
                Pay {formatMoney(LOVE_MARKET_COST)} & submit
              </Button>
            ) : (
              <BuyManaButton amount={10000} />
            )}
            <div className="text-xs text-red-500">{error}</div>
          </Col>
        </Row>
      </Col>
    </LovePage>
  )
}

const Section = ({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) => {
  return (
    <Col className="gap-2">
      <div className="text-ink-700 bg-canvas-50 px-5 py-1.5 font-semibold">
        {title}
      </div>
      <Col className="gap-4 px-5">{children}</Col>
    </Col>
  )
}
