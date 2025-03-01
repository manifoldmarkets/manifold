'use client'
import clsx from 'clsx'
import { WebPriceInDollars, PaymentAmount } from 'common/economy'
import { ENV_CONFIG } from 'common/envs/constants'

import { Txn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { sum } from 'lodash'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { APIError, api } from 'web/lib/api/api'
import { Button } from './buttons/button'
import { Modal } from './layout/modal'
import { AmountInput } from './widgets/amount-input'
import { Col } from './layout/col'
import { shortenNumber } from 'common/util/formatNumber'
import router from 'next/router'
import { useIosPurchases } from 'web/hooks/use-ios-purchases'
import { useNativeInfo } from './native-message-provider'
import { TokenNumber } from './widgets/token-number'
import { FundsSelector } from 'web/components/gidx/funds-selector'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { checkoutURL } from 'web/lib/service/stripe'

const BUY_MANA_GRAPHICS = [
  '/buy-mana-graphics/10k.png',
  '/buy-mana-graphics/25k.png',
  '/buy-mana-graphics/100k.png',
  '/buy-mana-graphics/1M.png',
]

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
      size="lg"
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
  const privateUser = usePrivateUser()
  const { isIOS } = useNativeInfo()
  const [loadingPrice, setLoadingPrice] = useState<WebPriceInDollars | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const { initiatePurchaseInDollars, loadingMessage } = useIosPurchases(
    setError,
    setLoadingPrice,
    onClose
  )

  return (
    <Col className={'gap-2'}>
      <FundsSelector
        onSelectPriceInDollars={(dollarAmount) => {
          if (!user || !privateUser) return firebaseLogin()
          if (isIOS) {
            initiatePurchaseInDollars(dollarAmount)
          } else {
            router.push(`/checkout?dollarAmount=${dollarAmount}`)
          }
          setLoadingPrice(dollarAmount)
        }}
        loadingPrice={loadingPrice}
      />
      {loadingMessage && <span className="text-ink-500">{loadingMessage}</span>}
      {error && <span className="text-error">{error}</span>}
    </Col>
  )
}

export function PriceTile(props: {
  amounts: PaymentAmount
  index: number
  loadingPrice: WebPriceInDollars | null
  disabled: boolean
  user: User | null | undefined
  onClick?: () => void
}) {
  const { loadingPrice, onClick, amounts, index, user } = props
  const { mana, priceInDollars, bonusInDollars } = amounts
  const { isIOS } = useNativeInfo()

  const isCurrentlyLoading = loadingPrice === priceInDollars
  const disabled = props.disabled || (loadingPrice && !isCurrentlyLoading)

  const useStripe = bonusInDollars === 0 && !isIOS

  const onClickHandler = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault()
      firebaseLogin()
      return
    }

    if (!useStripe && onClick) {
      onClick()
    }
  }

  const imgSrc =
    BUY_MANA_GRAPHICS[Math.min(index, BUY_MANA_GRAPHICS.length - 1)]
  const tile = (
    <button
      className={clsx(
        ' bg-canvas-0 group relative flex h-fit w-full flex-col items-center rounded text-center shadow transition-all ',
        disabled
          ? 'pointer-events-none cursor-not-allowed opacity-50'
          : 'opacity-90 ring-2 ring-opacity-0 hover:opacity-100 hover:ring-opacity-100',
        'ring-indigo-600',
        isCurrentlyLoading && 'pointer-events-none animate-pulse cursor-wait'
      )}
      type={useStripe ? 'submit' : 'button'}
      onClick={onClickHandler}
    >
      <Col className={' w-full items-center rounded-t px-4 pb-2 pt-4'}>
        <Image
          src={imgSrc}
          alt={`${shortenNumber(mana)} mana`}
          className="100%"
          width={120}
          height={120}
        />

        <div
          className={clsx(
            'text-ink-1000 text-lg font-semibold',
            imgSrc == '/buy-mana-graphics/10k.png' ||
              imgSrc == '/buy-mana-graphics/25k.png'
              ? '-mt-6'
              : '-mt-3'
          )}
        >
          Ṁ{shortenNumber(mana)}{' '}
        </div>
        {bonusInDollars > 0 && (
          <Row
            className={clsx(
              `mx-auto items-center justify-center gap-1 whitespace-nowrap text-sm text-amber-600 dark:text-amber-400 `
            )}
          >
            <span>+</span>
            <TokenNumber
              coinType="sweepies"
              className="text-lg font-bold"
              amount={bonusInDollars}
              numberType="short"
            />{' '}
            <span>free</span>
          </Row>
        )}
      </Col>

      <div
        className={clsx(
          'w-full rounded-b px-4 py-1 text-lg font-semibold text-white sm:text-xl',
          'bg-indigo-600'
        )}
      >
        Buy ${priceInDollars}
      </div>
    </button>
  )
  const [url, setUrl] = useState('https://manifold.markets')
  useEffect(() => setUrl(window.location.href), [])
  if (useStripe) {
    return (
      <form
        // Expects cents
        action={checkoutURL(user?.id || '', amounts.priceInDollars, url)}
        method="POST"
      >
        {tile}
      </form>
    )
  }
  return tile
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

export const use24hrUsdPurchasesInDollars = (userId: string) => {
  const [purchases, setPurchases] = useState<Txn[]>([])

  useEffect(() => {
    api('txns', {
      category: 'MANA_PURCHASE',
      toId: userId,
      after: Date.now() - DAY_MS,
    }).then(setPurchases)
  }, [userId])

  return sum(purchases.map((t) => t.data?.paidInCents)) / 100
}
