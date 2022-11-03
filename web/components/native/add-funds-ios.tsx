import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import React from 'react'
import { Row } from 'web/components/layout/row'
import { PAST_BET } from 'common/user'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Card } from 'web/components/widgets/card'

export function AddFundsIOS() {
  useRedirectIfSignedOut()
  useTracking('view add funds')

  return (
    <Page>
      <SEO
        title="Get Mana"
        description="Buy mana to trade in your favorite markets on Manifold"
        url="/add-funds"
      />

      <Col className="items-center">
        <Col className="h-full rounded bg-white p-4 py-8 sm:p-8 sm:shadow-md">
          <Title className="!mt-0" text="Get Mana" />
          <img
            className="mb-6 block self-center"
            src="/welcome/manipurple.png"
            width={200}
            height={158}
          />
          <div className="mb-6 text-indigo-700">
            These are the best ways to get mana (M$): <br />
          </div>
          {OtherWaysToGetMana(true)}
        </Col>
      </Col>
    </Page>
  )
}

export const OtherWaysToGetMana = (includeBuyingNote?: boolean) => {
  const cardClass = 'p-2 shadow-md'
  return (
    <Col className={'text-md gap-y-4 text-gray-700'}>
      <Card className={cardClass}>
        <Row>
          - Add a helpful comment to a market or post to earn tips from other
          users.
        </Row>
      </Card>
      <Card className={cardClass}>
        <span>
          - Place a {PAST_BET} once per day to get your streak bonus. (up to
          <span className={'mx-1 inline-block text-indigo-700'}>
            {formatMoney(BETTING_STREAK_BONUS_MAX)}
          </span>
          per day!).
        </span>
      </Card>
      <Card className={cardClass}>
        <span>
          - Refer a friend and get
          <span className={'mx-1 inline-block text-indigo-700'}>
            {formatMoney(REFERRAL_AMOUNT)}
          </span>
          per signup.
        </span>
      </Card>
      <Card className={cardClass}>
        <span>
          - Make a market and get
          <span className={'mx-1 inline-block text-indigo-700'}>
            {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)}
          </span>
          per unique trader.
        </span>
      </Card>
      <Card className={cardClass}>
        <span>
          - Come by our
          <a
            className={'mx-1 text-indigo-700'}
            href={'https://discord.gg/3Zuth9792G'}
          >
            discord
          </a>
          and ask nicely - we pay new users for sharing their experience!
        </span>
      </Card>
      <Card className={cardClass}>
        <span>
          - Contribute to our{' '}
          <a
            className={'text-indigo-700'}
            href={'https://github.com/manifoldmarkets/manifold'}
          >
            codebase
          </a>
          , even something simple, and we'll pay you a bounty.
        </span>
      </Card>
      {includeBuyingNote && (
        <Card className={cardClass}>
          - Visit our website in your browser to buy mana with a credit card.
        </Card>
      )}
    </Col>
  )
}
