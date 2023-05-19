import { formatMoney, manaToUSD } from 'common/util/format'
import React, { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Tabs } from './layout/tabs'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { postMessageToNative } from 'web/components/native-message-listener'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import Link from 'next/link'
import { validateIapReceipt } from 'web/lib/firebase/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { ChoicesToggleGroup } from './widgets/choices-toggle-group'
import { query, where } from 'firebase/firestore'
import { coll, listenForValues } from 'web/lib/firebase/utils'
import { sum } from 'lodash'
import { AlertBox } from './widgets/alert-box'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
    >
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
                <div className="mt-6 mb-4">Other ways to get mana:</div>
                <OtherWaysToGetMana />
              </>
            ),
          },
        ]}
      />
    </Modal>
  )
}

export function BuyManaTab(props: { onClose: () => void }) {
  const { onClose } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES
  const [amountSelected, setAmountSelected] = useState<number>(
    prices[formatMoney(2500)]
  )
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

  const [url, setUrl] = useState('https://manifold.markets')
  useEffect(() => setUrl(window.location.href), [])

  const totalPurchased = use24hrUsdPurchases(user?.id || '')
  const pastLimit = totalPurchased >= 500

  return (
    <>
      <div className="mt-6 mb-4">
        Buy mana ({ENV_CONFIG.moneyMoniker}) to trade in your favorite markets.
        <div className="italic">Not redeemable for cash.</div>
      </div>

      <div className="text-ink-500 mb-2 text-sm">Amount</div>
      <FundsSelector
        fundAmounts={prices}
        selected={amountSelected}
        onSelect={setAmountSelected}
      />

      <div className="mt-6">
        <div className="text-ink-500 mb-1 text-sm">Price USD</div>
        <div className="text-xl">{manaToUSD(amountSelected)}</div>
      </div>

      {pastLimit && (
        <AlertBox
          title="Purchase limit"
          text="You have reached your daily purchase limit. Please try again tomorrow."
          className="my-4"
        />
      )}

      <div className="mt-2 flex gap-2">
        <Button color="gray" onClick={onClose}>
          Back
        </Button>

        {isNative && platform === 'ios' ? (
          <Button
            color={'gradient'}
            loading={loading}
            disabled={pastLimit}
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
            action={checkoutURL(user?.id || '', amountSelected, url)}
            method="POST"
          >
            <Button type="submit" color="gradient" disabled={pastLimit}>
              Checkout
            </Button>
          </form>
        )}
      </div>
      <Row className="mt-2 text-sm text-red-500">{error}</Row>
    </>
  )
}

export const OtherWaysToGetMana = () => {
  return (
    <ul className="border-ink-100 border-t">
      <Item url="/ad">
        👀 Read ads for
        <span className={'mx-1 font-bold'}>{formatMoney(5)}</span>per ad
      </Item>
      <Item>
        🔥 Streak bonus (up to
        <span className={'mx-1 font-bold'}>
          {formatMoney(BETTING_STREAK_BONUS_MAX)}
        </span>
        per day)
      </Item>
      <Item url="/referrals">
        👋 Refer a friend for
        <span className={'mx-1 font-bold'}>{formatMoney(REFERRAL_AMOUNT)}</span>
        after their first trade
      </Item>
      <Item url="/create">
        📈 Make a market for
        <span className={'mx-1 font-bold'}>
          {formatMoney(UNIQUE_BETTOR_BONUS_AMOUNT)}
        </span>
        per unique trader
      </Item>
    </ul>
  )
}

const Item = (props: { children: React.ReactNode; url?: string }) => {
  const { children, url } = props
  return (
    <li className="border-ink-100 border-b">
      {url ? (
        <Link href={url}>
          <div className="hover:bg-primary-100 py-3">{children}</div>
        </Link>
      ) : (
        <div className="py-3">{children}</div>
      )}
    </li>
  )
}

export function FundsSelector(props: {
  fundAmounts: { [key: string]: number }
  selected: number
  onSelect: (selected: number) => void
}) {
  const { selected, onSelect, fundAmounts } = props

  return (
    <ChoicesToggleGroup
      className="self-start"
      currentChoice={selected}
      choicesMap={fundAmounts}
      setChoice={onSelect as any}
    />
  )
}

export const use24hrUsdPurchases = (userId: string) => {
  const [purchases, setPurchases] = useState<any[]>([])

  useEffect(() => {
    return listenForValues<any>(
      query(coll<any>('stripe-transactions'), where('userId', '==', userId)),
      setPurchases
    )
  }, [userId])

  //  TODO: include ios purchases

  return (
    sum(
      purchases
        .filter((p) => p.timestamp > Date.now() - 24 * 60 * 60 * 1000)
        .map((p) => p.manticDollarQuantity)
    ) / 100
  )
}
