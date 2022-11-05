import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import React from 'react'
import { PAST_BET } from 'common/user'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Card } from 'web/components/widgets/card'
import Link from 'next/link'

export function AddFundsIOS() {
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
          <div className="mb-4 text-indigo-700">
            These are the best ways to get mana (M$):
          </div>
          <OtherWaysToGetMana includeBuyNote />
        </Col>
      </Col>
    </Page>
  )
}

export const OtherWaysToGetMana = (props: { includeBuyNote?: boolean }) => {
  const { includeBuyNote } = props
  return (
    <ul className="space-y-2 text-sm">
      <Item>
        Add a helpful comment to a market or post to earn tips from other users
      </Item>
      <Item>
        Place your first {PAST_BET} of the day to get your streak bonus (up to
        <span className={'mx-1 font-bold'}>
          {formatMoney(BETTING_STREAK_BONUS_MAX)}
        </span>
        per day!)
      </Item>
      <Item url="/referrals">
        Refer a friend and get
        <span className={'mx-1 font-bold'}>{formatMoney(REFERRAL_AMOUNT)}</span>
        per signup
      </Item>
      <Item url="/create">
        Make a market and get
        <span className={'mx-1 font-bold'}>
          {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)}
        </span>
        per unique trader
      </Item>
      <Item url="https://discord.gg/3Zuth9792G">
        Come by our discord and ask nicely. We pay new users for sharing their
        experience!
      </Item>
      <Item url="https://github.com/manifoldmarkets/manifold">
        Contribute to our codebase, even something simple, and we'll pay you a
        bounty
      </Item>
      {includeBuyNote && (
        <Item>
          Visit our website in your browser to buy mana with a credit card.
        </Item>
      )}
    </ul>
  )
}

const Item = (props: { children: React.ReactNode; url?: string }) => {
  const { children, url } = props
  return (
    <li>
      {url ? (
        <Link href={url}>
          <Card className="p-2">{children}</Card>
        </Link>
      ) : (
        <Card className="pointer-events-none cursor-auto p-2">{children}</Card>
      )}
    </li>
  )
}
