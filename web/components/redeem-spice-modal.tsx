'use client'
import { formatMoney, manaToUSD } from 'common/util/format'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { checkoutURL } from 'web/lib/service/stripe'
import { Button } from './buttons/button'
import { MODAL_CLASS, Modal } from './layout/modal'
import { getNativePlatform } from 'web/lib/native/is-native'
import { Tabs } from './layout/tabs'
import { IOS_PRICES, WEB_PRICES } from 'web/pages/add-funds'
import {
  BETTING_STREAK_BONUS_MAX,
  REFERRAL_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import Link from 'next/link'
import { APIError, api, validateIapReceipt } from 'web/lib/firebase/api'
import { useNativeMessages } from 'web/hooks/use-native-messages'
import { Row } from 'web/components/layout/row'
import {
  ENV_CONFIG,
  SPICE_CONVERSION_RATE,
  SPICE_PRODUCTION_ENABLED,
} from 'common/envs/constants'
import { ChoicesToggleGroup } from './widgets/choices-toggle-group'
import { query, where } from 'firebase/firestore'
import { coll, listenForValues } from 'web/lib/firebase/utils'
import { sum } from 'lodash'
import { AlertBox } from './widgets/alert-box'
import { AD_REDEEM_REWARD } from 'common/boost'
import { Txn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { postMessageToNative } from 'web/lib/native/post-message'
import { buildArray } from 'common/util/array'
import { Col } from 'web/components/layout/col'
import { linkClass } from 'web/components/widgets/site-link'
import clsx from 'clsx'
import { AmountInput } from './widgets/amount-input'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { User } from 'common/user'
import { CoinNumber } from './widgets/manaCoinNumber'
import { SpiceToManaForm } from './add-funds-modal'

export type RedeemSpicePageType = 'main' | 'customMana'

export function RedeemSpiceModal(props: {
  open: boolean
  setOpen(open: boolean): void
  user: User
}) {
  const { open, setOpen, user } = props
  const { isNative, platform } = getNativePlatform()
  const [page, setPage] = useState<RedeemSpicePageType>('main')

  return (
    <Modal open={open} setOpen={setOpen} className={clsx(MODAL_CLASS)}>
      {page == 'main' ? (
        <MainSpiceRedeemPage user={user} setPage={setPage} />
      ) : page == 'customMana' ? (
        <SpiceToManaForm
          onBack={() => setPage('main')}
          onClose={() => setOpen(false)}
        />
      ) : (
        <></>
      )}
    </Modal>
  )
}

function MainSpiceRedeemPage(props: {
  user: User
  setPage: (page: RedeemSpicePageType) => void
}) {
  const { user, setPage } = props
  const [disableAllButtons, setDisableAllButtons] = useState(false)
  return (
    <Col className="gap-2">
      <CoinNumber amount={user.spiceBalance} isSpice className="text-4xl" />
      <Col className="bg-canvas-50 gap-4 rounded-lg p-4 pb-1">
        <Row className="gap-2">
          <ManaCoin className="text-7xl" />
          <Col>
            <div className="text-lg font-semibold">Get Mana</div>
            <div className="text-sm">
              Use mana to make more bets to win more PrizePoints!
            </div>
          </Col>
        </Row>
        <Row className="w-full gap-2">
          <Button
            onClick={() => {
              setPage('customMana')
            }}
            size="xs"
            color="gray-outline"
            className="h-fit w-1/2 text-xs sm:text-sm"
          >
            Trade custom amount
          </Button>
          <AllSpiceToManaButton
            user={user}
            setDisableAllButtons={setDisableAllButtons}
            disableAllButtons={disableAllButtons}
          />
        </Row>
      </Col>
    </Col>
  )
}
// TODO: TEST THIS
function AllSpiceToManaButton(props: {
  user: User
  disableAllButtons: boolean
  setDisableAllButtons: (disabled: boolean) => void
}) {
  const { user, disableAllButtons, setDisableAllButtons } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const spiceBalance = user.spiceBalance
  const onSubmit = async () => {
    if (!spiceBalance) return
    setLoading(true)
    setDisableAllButtons(true)
    try {
      await api('convert-sp-to-mana', { amount: spiceBalance })
      setLoading(false)
      setError(null)
      setDisableAllButtons(false)
    } catch (e) {
      console.error(e)
      setError(e instanceof APIError ? e.message : 'Error converting')
      setLoading(false)
      setDisableAllButtons(false)
    }
  }
  return (
    <Col className="w-1/2 gap-0.5">
      <Button
        onClick={onSubmit}
        size="xs"
        className="w-full text-xs sm:text-sm"
        loading={loading}
        disabled={disableAllButtons}
      >
        Trade all for mana
      </Button>
      {!error && (
        <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
          <CoinNumber
            amount={user.spiceBalance * SPICE_CONVERSION_RATE}
            className="text-primary-500 font-semibold"
          />
          mana value
        </Row>
      )}
      {!!error && (
        <Row className="text-scarlet-700 w-full justify-end gap-1 whitespace-nowrap  text-xs sm:text-sm">
          {error}
        </Row>
      )}
    </Col>
  )
}
