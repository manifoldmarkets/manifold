'use client'
import clsx from 'clsx'
import { AD_REDEEM_REWARD } from 'common/boost'
import { BETTING_STREAK_BONUS_MAX, REFERRAL_AMOUNT } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'
import { MesageTypeMap, nativeToWebMessageType } from 'common/native-message'
import { convertTxn } from 'common/supabase/txns'
import { run } from 'common/supabase/utils'
import { Txn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { sum } from 'lodash'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { useUser } from 'web/hooks/use-user'
import { APIError, api, validateIapReceipt } from 'web/lib/api/api'
import { getNativePlatform } from 'web/lib/native/is-native'
import { postMessageToNative } from 'web/lib/native/post-message'
import { checkoutURL } from 'web/lib/service/stripe'
import { db } from 'web/lib/supabase/db'
import { IOS_PRICES, WEB_PRICES, WebPriceKeys } from 'web/pages/add-funds'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { AlertBox } from './widgets/alert-box'
import { AmountInput } from './widgets/amount-input'
import { CoinNumber } from './widgets/manaCoinNumber'
import { Col } from './layout/col'
import { shortenNumber } from 'web/lib/util/formatNumber'

export function AddFundsModal(props: {
  open: boolean
  setOpen(open: boolean): void
}) {
  const { open, setOpen } = props
  // TODO: check if they're registered already in gidx & get their status
  // const res = useAPIGetter('get-monitor-status-gidx', {})

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      className="bg-canvas-0 text-ink-1000 rounded-md p-8"
    >
      <BuyManaTab onClose={() => setOpen(false)} />
      {/* <Tabs
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
      /> */}
    </Modal>
  )
}

export function BuyManaTab(props: { onClose: () => void }) {
  const { onClose } = props
  const user = useUser()
  const { isNative, platform } = getNativePlatform()
  const prices = isNative && platform === 'ios' ? IOS_PRICES : WEB_PRICES
  const [loading, setLoading] = useState<WebPriceKeys | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handleIapReceipt = async <T extends nativeToWebMessageType>(
    type: T,
    data: MesageTypeMap[T]
  ) => {
    if (type === 'iapReceipt') {
      const { receipt } = data as MesageTypeMap['iapReceipt']
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
    setLoading(null)
  }
  useNativeMessages(['iapReceipt', 'iapError'], handleIapReceipt)

  const [url, setUrl] = useState('https://manifold.markets')
  useEffect(() => setUrl(window.location.href), [])

  const totalPurchased = use24hrUsdPurchases(user?.id || '')
  const pastLimit = totalPurchased >= 2500

  return (
    <>
      <div className="mb-4">
        Buy <ManaCoin /> mana to trade in your favorite questions.
      </div>

      {pastLimit && (
        <AlertBox title="Purchase limit" className="my-4">
          You have reached your daily purchase limit. Please try again tomorrow.
        </AlertBox>
      )}

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(prices).map(([manaAmount, dollarAmount]) =>
          isNative && platform === 'ios' ? (
            <PriceTile
              key={`ios-${manaAmount}`}
              dollarAmount={dollarAmount}
              manaAmount={manaAmount as unknown as WebPriceKeys}
              loading={loading}
              disabled={pastLimit}
              onClick={() => {
                setError(null)
                setLoading(manaAmount as unknown as WebPriceKeys)
                postMessageToNative('checkout', { amount: dollarAmount })
              }}
            />
          ) : (
            <form
              key={`web-${manaAmount}`}
              action={checkoutURL(user?.id || '', dollarAmount, url)}
              method="POST"
            >
              <PriceTile
                dollarAmount={dollarAmount}
                manaAmount={manaAmount as unknown as WebPriceKeys}
                loading={loading}
                disabled={pastLimit}
                isSubmitButton
              />
            </form>
          )
        )}
      </div>
      <Row className="text-error mt-2 text-sm">{error}</Row>
    </>
  )
}

function PriceTile(props: {
  dollarAmount: number
  manaAmount: WebPriceKeys
  loading: WebPriceKeys | null
  disabled: boolean
  onClick?: () => void
  isSubmitButton?: boolean
}) {
  const { dollarAmount, manaAmount, loading, onClick, isSubmitButton } = props

  const isCurrentlyLoading = loading === manaAmount
  const disabled = props.disabled || (loading && !isCurrentlyLoading)
  return (
    <button
      id={`ios-${manaAmount}-tile`}
      // loading={loading}
      className={clsx(
        'group relative flex w-full flex-col items-center rounded text-center opacity-90 shadow transition-all hover:opacity-100',
        'ring-2 ring-blue-600 ring-opacity-0 hover:ring-opacity-100'
      )}
      type={isSubmitButton ? 'submit' : 'button'}
      onClick={onClick}
    >
      <Col className="bg-canvas-50 items-center rounded-t px-4 py-2">
        <Image
          src={
            manaAmount == 10000
              ? '/buy-mana-graphics/10k.png'
              : manaAmount == 25000
              ? '/buy-mana-graphics/25k.png'
              : manaAmount == 100000
              ? '/buy-mana-graphics/100k.png'
              : manaAmount == 1000000
              ? '/buy-mana-graphics/1M.png'
              : ''
          }
          alt="10k mana"
          width={560}
          height={400}
        />

        <div className="text-primary-700 -mt-2 text-xl font-semibold">
          {shortenNumber(manaAmount)}{' '}
        </div>
      </Col>
      <Col className="w-full rounded-b bg-blue-600 px-4 py-1 text-lg font-semibold text-white">
        ${dollarAmount / 100}
      </Col>
    </button>
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
        <CoinNumber amount={REFERRAL_AMOUNT} coinType={'spice'} isInline />{' '}
        after their first trade
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
