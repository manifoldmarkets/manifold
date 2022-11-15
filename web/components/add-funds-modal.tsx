import { manaToUSD } from 'common/util/format'
import React, { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Tabs } from './layout/tabs'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { postMessageToNative } from 'web/components/native-message-listener'
import { PAST_BET } from 'common/user'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import Link from 'next/link'
import { Card } from 'web/components/widgets/card'
import { validateIapReceipt } from 'web/lib/firebase/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { FormattedMana } from 'web/components/mana'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  return (
    <Modal open={open} setOpen={setOpen} className="rounded-md bg-white p-8">
      <Tabs
        currentPageForAnalytics="buy modal"
        tabs={[
          {
            title: 'Buy Mana',
            content: <BuyManaTab onClose={() => setOpen(false)} />,
          },
          {
            title: "I'm Broke",
            content: (
              <>
                <div className="mt-6 mb-4">
                  Here are some other ways to get mana:
                </div>
                <OtherWaysToGetMana />
              </>
            ),
          },
        ]}
      />
    </Modal>
  )
}

function BuyManaTab(props: { onClose: () => void }) {
  const { onClose } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES
  const [amountSelected, setAmountSelected] = useState<number>(prices[2500])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleIapReceipt = async (type: string, data: any) => {
    if (type === 'iapReceipt') {
      const { receipt } = data
      try {
        await validateIapReceipt({ receipt: receipt })
        console.log('iap receipt validated')
        onClose()
      } catch (e) {
        console.log('iap receipt validation error', e)
        setError('Error validating receipt')
      }
    } else if (type === 'iapError') {
      setError('Error during purchase! Try again.')
    }
    setLoading(false)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  return (
    <>
      <div className="mt-6 mb-4">
        Buy mana (M$) to trade in your favorite markets.
        <div className="italic">Not redeemable for cash.</div>
      </div>

      <div className="mb-2 text-sm text-gray-500">Amount</div>
      <FundsSelector
        fundAmounts={prices}
        selected={amountSelected}
        onSelect={setAmountSelected}
        btnClassName={'max-w-[7rem]'}
      />

      <div className="mt-6">
        <div className="mb-1 text-sm text-gray-500">Price USD</div>
        <div className="text-xl">{manaToUSD(amountSelected)}</div>
      </div>

      <div className="mt-2 flex gap-2">
        <Button color="gray" onClick={onClose}>
          Back
        </Button>

        {isNative && platform === 'ios' ? (
          <Button
            color={'gradient'}
            loading={loading}
            onClick={() => {
              setError(null)
              setLoading(true)
              postMessageToNative('checkout', { amount: amountSelected })
            }}
          >
            Checkout
          </Button>
        ) : (
          <form
            action={checkoutURL(
              user?.id || '',
              amountSelected,
              window.location.href
            )}
            method="POST"
          >
            <Button type="submit" color="gradient">
              Checkout
            </Button>
          </form>
        )}
      </div>
      <Row className="mt-2 text-sm text-red-500">{error}</Row>
    </>
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
          <FormattedMana amount={BETTING_STREAK_BONUS_MAX} />
        </span>
        per day!)
      </Item>
      <Item url="/referrals">
        Refer a friend and get
        <span className={'mx-1 font-bold'}>
          <FormattedMana amount={REFERRAL_AMOUNT} />
        </span>
        per signup
      </Item>
      <Item url="/create">
        Make a market and get
        <span className={'mx-1 font-bold'}>
          <FormattedMana amount={UNIQUE_BETTOR_BONUS_AMOUNT} />
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

export function FundsSelector(props: {
  fundAmounts: { [key: number]: number }
  selected: number
  onSelect: (selected: number) => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className, fundAmounts } = props
  const btnClassName = clsx('!px-2 whitespace-nowrap', props.btnClassName)

  return (
    <Row className={clsx('flex-wrap justify-center gap-3', className)}>
      {Object.entries(fundAmounts).map(([key, amount]) => (
        <Button
          key={amount}
          color={selected === amount ? 'indigo' : 'gray'}
          onClick={() => onSelect(amount as any)}
          className={btnClassName}
        >
          <FormattedMana amount={key} />
        </Button>
      ))}
    </Row>
  )
}
