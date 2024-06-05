'use client'
import { formatMoney } from 'common/util/format'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Tabs } from './layout/tabs'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import { BETTING_STREAK_BONUS_MAX, REFERRAL_AMOUNT } from 'common/economy'
import Link from 'next/link'
import { APIError, api, validateIapReceipt } from 'web/lib/firebase/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from './widgets/choices-toggle-group'
import { sum } from 'lodash'
import { AlertBox } from './widgets/alert-box'
import { AD_REDEEM_REWARD } from 'common/boost'
import { Txn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { postMessageToNative } from 'web/lib/native/post-message'
import { buildArray } from 'common/util/array'
import { AmountInput } from './widgets/amount-input'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { convertTxn } from 'common/supabase/txns'
import { CoinNumber } from './widgets/manaCoinNumber'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { ENV_CONFIG } from 'common/envs/constants'

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
        trackingName="buy modal tabs"
        className="[&_svg]:hidden" // hide carousel switcher
        tabs={buildArray(
          {
            title: 'Buy mana',
            content: <BuyManaTab onClose={() => setOpen(false)} />,
          },
          {
            title: 'Earn free mana',
            content: (
              <>
                <div className="my-4">Other ways to earn mana:</div>
                <OtherWaysToGetMana />
              </>
            ),
          }
        )}
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
    prices[formatMoney(25000)]
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
  const pastLimit = totalPurchased >= 2500

  return (
    <>
      <div className="my-4">
        Buy <ManaCoin /> mana to trade in your favorite questions.
      </div>

      <div className="text-ink-500 mb-2 text-sm">Amount</div>
      <FundsSelector
        fundAmounts={prices}
        selected={amountSelected}
        onSelect={setAmountSelected}
      />

      <div className="mt-6">
        <div className="text-ink-500 mb-1 text-sm">Price USD</div>
        <div className="text-xl">${amountSelected / 100}</div>
      </div>

      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit. Please try again tomorrow.
        </AlertBox>
      )}

      <div className="mt-2 flex gap-2">
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
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
  )
}

export const OtherWaysToGetMana = () => {
  return (
    <ul className="border-ink-100 border-t">
      <Item>
        🚀 Browse feed for <CoinNumber amount={AD_REDEEM_REWARD} isInline />{' '}
        from each boosted question
      </Item>
      <Item>
        🔥 Streak bonus (up to{' '}
        <CoinNumber amount={BETTING_STREAK_BONUS_MAX} isInline /> per day)
      </Item>
      <Item url="/referrals">
        👋 Refer a friend for{' '}
        <CoinNumber amount={REFERRAL_AMOUNT} isSpice isInline /> after their
        first trade
      </Item>
    </ul>
  )
}

export const SpiceToManaForm = (props: {
  onBack: () => void
  onClose: () => void
}) => {
  const [amount, setAmount] = useState<number | undefined>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!amount) return
    setLoading(true)
    try {
      await api('convert-sp-to-mana', { amount })
      setLoading(false)
      setAmount(amount)
      setError(null)
      props.onClose()
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="my-4">Convert at a rate of 1 prize point to 1 mana.</div>
      <div className="text-ink-500 mb-2 text-sm">Amount</div>
      <AmountInput amount={amount} onChangeAmount={setAmount} />
      <div className="mt-4 flex gap-2">
        <Button color="gray" onClick={props.onBack}>
          Back
        </Button>
        <Button
          color="gradient"
          disabled={!amount}
          loading={loading}
          onClick={onSubmit}
        >
          Convert to {ENV_CONFIG.moneyMoniker}
          {amount}
        </Button>
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
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
  fundAmounts: { [key: number]: number }
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

const use24hrUsdPurchases = (userId: string) => {
  const [purchases, setPurchases] = useState<Txn[]>([])

  useEffect(() => {
    run(
      db
        .from('txns')
        .select()
        .eq('category', 'MANA_PURCHASE')
        .eq('to_id', userId)
    ).then((res) => {
      setPurchases(res.data.map(convertTxn))
    })
  }, [userId])

  return (
    sum(
      purchases
        .filter((t) => t.createdTime > Date.now() - DAY_MS)
        .map((t) => t.amount)
    ) / 1000
  )
}
