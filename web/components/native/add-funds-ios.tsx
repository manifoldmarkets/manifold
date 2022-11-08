import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useTracking } from 'web/hooks/use-tracking'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import React, { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { PAST_BET } from 'common/user'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Card } from 'web/components/widgets/card'
import { FundsSelector } from 'web/components/bet/yes-no-selector'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from 'web/components/buttons/button'
import { trackCallback } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'
import { PRICES_LIST } from 'web/pages/add-funds'
import { Modal } from 'web/components/layout/modal'

export function AddFundsIOS(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  useRedirectIfSignedOut()
  useTracking('view add funds')
  const user = useUser()

  const [amountSelected, setAmountSelected] = useState<number>(2999)

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="max-h-[34rem] overflow-y-scroll rounded-md bg-white p-8"
    >
      <Title className="!mt-0" text="Get Mana" />
      <div className="mb-6 text-gray-500">
        Buy mana (M$) to trade in your favorite markets. <br />{' '}
      </div>

      <div className="mb-2 text-sm text-gray-500">Amount</div>
      <FundsSelector
        fundAmounts={PRICES_LIST}
        className="flex-wrap justify-center gap-y-2"
        btnClassName={'max-w-[100px]'}
        selected={amountSelected}
        onSelect={(amount) => {
          const newAmount = Math.round((amount * 0.2 + amount) / 100) - 0.01
          setAmountSelected(newAmount)
        }}
      />

      <div className="mt-6">
        <div className="mb-1 text-sm text-gray-500">Price USD</div>
        <div className="text-xl">${Math.round(amountSelected / 100)}</div>
      </div>

      <form
        action={checkoutURL(user?.id || '', amountSelected)}
        method="POST"
        className="mt-8"
      >
        <Button
          type="submit"
          color="gradient"
          size="xl"
          className="w-full"
          onClick={trackCallback('checkout', { amount: amountSelected })}
        >
          Checkout
        </Button>
      </form>

      <div className="mb-6 mt-6 text-gray-500">
        Short on USD?. Here are some other ways to get mana: <br />{' '}
      </div>
      {OtherWaysToGetMana(false)}
    </Modal>
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
