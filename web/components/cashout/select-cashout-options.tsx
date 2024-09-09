import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  baseButtonClasses,
  Button,
  buttonClass,
} from 'web/components/buttons/button'
import { User } from 'common/user'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { CashoutPagesType } from 'web/pages/cashout'
import { AllCashToManaButton } from './cash-to-mana'
import { useState } from 'react'
import {
  CASH_TO_MANA_CONVERSION_RATE,
  SPICE_NAME,
  SWEEPIES_NAME,
} from 'common/envs/constants'
import Link from 'next/link'
import clsx from 'clsx'
import { getNativePlatform } from 'web/lib/native/is-native'
import { MIN_CASHOUT_AMOUNT } from 'common/economy'
import { CoinNumber } from '../widgets/coin-number'

export function SelectCashoutOptions(props: {
  user: User
  redeemableCash: number
  setPage: (page: CashoutPagesType) => void
}) {
  const { user, redeemableCash, setPage } = props
  const [disableAllButtons, setDisableAllButtons] = useState(false)
  const { isNative, platform } = getNativePlatform()
  const isNativeIOS = isNative && platform === 'ios'

  const noHasMinRedeemableCash = redeemableCash < MIN_CASHOUT_AMOUNT

  const hasNoRedeemableCash = redeemableCash == 0

  return (
    <Col className="gap-4">
      <Col className="bg-canvas-0 w-full gap-4 rounded-lg  p-4 pb-1">
        <Row className="gap-2">
          <ManaCoin className="text-7xl" />
          <Col>
            <div className="text-lg font-semibold">Get Mana</div>
            <div className="text-sm">
              Trade your {SWEEPIES_NAME} for mana. You'll get{' '}
              {CASH_TO_MANA_CONVERSION_RATE} mana for every 1 {SWEEPIES_NAME}.
            </div>
          </Col>
        </Row>
        <Row className="w-full gap-2">
          <Button
            onClick={() => {
              setPage('custom-mana')
            }}
            size="xs"
            color="gray-outline"
            className="h-fit w-1/2 whitespace-nowrap text-xs sm:text-sm"
            disabled={disableAllButtons || hasNoRedeemableCash}
          >
            Redeem custom amount
          </Button>
          <AllCashToManaButton
            user={user}
            redeemableCash={redeemableCash}
            setDisableAllButtons={setDisableAllButtons}
            disableAllButtons={disableAllButtons}
            disabled={hasNoRedeemableCash}
          />
        </Row>
      </Col>
      {!isNativeIOS && (
        <Col className="bg-canvas-0 gap-4 rounded-lg p-4 pb-1">
          <Row className="gap-2">
            <img alt="donate" src="/images/donate.png" height={80} width={80} />
            <Col>
              <div className="text-lg font-semibold">Donate to Charity</div>
              <div className="text-sm">
                Donate your {SWEEPIES_NAME} as USD to a charitable cause!
              </div>
            </Col>
          </Row>
          <Col className="gap-0.5">
            <Link
              className={clsx(
                baseButtonClasses,
                buttonClass('xs', 'indigo'),
                'text-xs sm:text-sm'
              )}
              href="/charity"
            >
              Visit charity page
            </Link>
            <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
              <span className="font-semibold text-green-600 dark:text-green-500">
                ${redeemableCash.toFixed(2)}
              </span>
              value
            </Row>
          </Col>
        </Col>
      )}

      <Col className="bg-canvas-0 w-full gap-4 rounded-lg p-4 pb-1">
        <Row className=" gap-2">
          <img
            alt="donate"
            src="/images/cash-icon.png"
            height={80}
            width={80}
            className="h-[80px] w-[80px] object-contain"
          />
          <Col>
            <div className="text-lg font-semibold">Redeem for USD</div>
            <div className="text-sm">Redeem your {SWEEPIES_NAME} for USD</div>
          </Col>
        </Row>
        <Col className="gap-0.5">
          <Button
            className={clsx('text-xs sm:text-sm')}
            onClick={() => {
              setPage('documents')
            }}
            disabled={disableAllButtons || noHasMinRedeemableCash}
          >
            Redeem for USD
          </Button>
          <Row className="text-ink-500 w-full justify-between gap-1 whitespace-nowrap text-xs sm:text-sm ">
            {noHasMinRedeemableCash ? (
              <span className="text-red-600 dark:text-red-400">
                You need at least{' '}
                <CoinNumber
                  amount={MIN_CASHOUT_AMOUNT}
                  isInline
                  coinType="sweepies"
                  className="font-semibold text-amber-600 dark:text-amber-400"
                />{' '}
                to cash out
              </span>
            ) : (
              <></>
            )}
            <span>
              <span className="font-semibold text-green-600 dark:text-green-500">
                ${redeemableCash.toFixed(2)}
              </span>{' '}
              value
            </span>
          </Row>
        </Col>
      </Col>
    </Col>
  )
}
