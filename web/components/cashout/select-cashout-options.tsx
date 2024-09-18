import clsx from 'clsx'
import { MIN_CASHOUT_AMOUNT } from 'common/economy'
import {
  CASH_TO_MANA_CONVERSION_RATE,
  CHARITY_FEE,
  SWEEPIES_NAME,
} from 'common/envs/constants'
import { User } from 'common/user'
import Link from 'next/link'
import {
  baseButtonClasses,
  Button,
  buttonClass,
} from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { getNativePlatform } from 'web/lib/native/is-native'
import { CashoutPagesType } from 'web/pages/redeem'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { CoinNumber } from '../widgets/coin-number'
import { formatMoney, formatMoneyUSD, formatSweepies } from 'common/util/format'

export function SelectCashoutOptions(props: {
  user: User
  redeemableCash: number
  setPage: (page: CashoutPagesType) => void
  allDisabled?: boolean
}) {
  const { setPage, allDisabled, redeemableCash } = props
  const { isNative, platform } = getNativePlatform()
  const isNativeIOS = isNative && platform === 'ios'

  const noHasMinRedeemableCash = redeemableCash < MIN_CASHOUT_AMOUNT
  const hasNoRedeemableCash = redeemableCash === 0

  return (
    <Col className={clsx('gap-4', allDisabled && 'text-ink-700 opacity-80')}>
      <Col className="bg-canvas-50 w-full gap-4 rounded-lg p-4 pb-1">
        <Row className="gap-4">
          <ManaCoin className={clsx('text-7xl', allDisabled && 'grayscale')} />
          <Col>
            <div className="text-lg font-semibold">Get Mana</div>
            <div className="text-ink-700 text-sm">
              Redeem your {SWEEPIES_NAME} at{' '}
              <b>
                {formatSweepies(1)} {'→'}{' '}
                {formatMoney(CASH_TO_MANA_CONVERSION_RATE)}
              </b>
              , no fees included!
            </div>
          </Col>
        </Row>
        <Col className="gap-0.5">
          <Button
            onClick={() => {
              setPage('custom-mana')
            }}
            size="xs"
            color="violet"
            className="whitespace-nowrap text-xs sm:text-sm"
            disabled={!!allDisabled || hasNoRedeemableCash}
          >
            Redeem for mana
          </Button>
          <Row className="text-ink-500 w-full justify-end gap-1 whitespace-nowrap text-xs sm:text-sm ">
            <CoinNumber
              amount={redeemableCash * CASH_TO_MANA_CONVERSION_RATE}
              className={clsx(
                'font-semibold',
                allDisabled ? '' : 'text-violet-600 dark:text-violet-400'
              )}
              coinClassName={clsx(allDisabled && 'grayscale')}
            />
            mana value
          </Row>
        </Col>
      </Col>
      {!isNativeIOS && (
        <Col className="bg-canvas-50 gap-4 rounded-lg p-4 pb-1">
          <Row className="gap-4">
            <img
              alt="donate"
              src="/images/donate.png"
              height={80}
              width={80}
              className={clsx(allDisabled && 'grayscale')}
            />
            <Col>
              <div className="text-lg font-semibold">Donate to Charity</div>
              <div className="text-ink-700 text-sm">
                Redeem your {SWEEPIES_NAME} as a donation to a charitable cause.
              </div>
            </Col>
          </Row>
          <Col className="gap-0.5">
            <Link
              className={clsx(
                baseButtonClasses,
                buttonClass(
                  'xs',
                  noHasMinRedeemableCash || allDisabled ? 'gray' : 'indigo'
                ),
                'text-xs sm:text-sm',
                noHasMinRedeemableCash || allDisabled ? 'text-white' : ''
              )}
              href="/charity"
            >
              Visit charity page
            </Link>
            <Row className="text-ink-500 w-full justify-between gap-1 whitespace-nowrap text-xs sm:text-sm ">
              <span>
                {noHasMinRedeemableCash && !allDisabled ? (
                  <span className="text-red-600 dark:text-red-400">
                    You need at least{' '}
                    <CoinNumber
                      amount={MIN_CASHOUT_AMOUNT}
                      isInline
                      coinType="sweepies"
                      className="font-semibold text-amber-600 dark:text-amber-400"
                    />{' '}
                    to donate
                  </span>
                ) : null}
              </span>
              <span>
                <span
                  className={clsx(
                    'font-semibold',
                    allDisabled ? '' : 'text-green-600 dark:text-green-500'
                  )}
                >
                  ${redeemableCash.toFixed(2)}
                </span>{' '}
                value
              </span>
            </Row>
          </Col>
        </Col>
      )}

      <Col className="bg-canvas-50 w-full gap-4 rounded-lg p-4 pb-1">
        <Row className=" gap-4">
          <img
            alt="donate"
            src="/images/cash-icon.png"
            height={80}
            width={80}
            className={clsx(
              'h-[80px] w-[80px] object-contain',
              allDisabled && 'grayscale'
            )}
          />
          <Col>
            <div className="text-lg font-semibold">Redeem for USD</div>
            <div className="text-ink-700 text-sm">
              Redeem your {SWEEPIES_NAME} at{' '}
              <b>
                {formatSweepies(1)} {'→'} {formatMoneyUSD(1)}
              </b>
              , minus a <b>{CHARITY_FEE * 100}% fee</b>.
            </div>
          </Col>
        </Row>
        <Col className="gap-0.5">
          <Button
            className={clsx('text-xs sm:text-sm')}
            onClick={() => {
              setPage('documents')
            }}
            disabled={!!allDisabled || noHasMinRedeemableCash}
          >
            Redeem for USD
          </Button>
          <Row className="text-ink-500 w-full justify-between gap-1 whitespace-nowrap text-xs sm:text-sm ">
            <span>
              {noHasMinRedeemableCash && !allDisabled ? (
                <span className="text-red-600 dark:text-red-400">
                  You need at least{' '}
                  <CoinNumber
                    amount={MIN_CASHOUT_AMOUNT}
                    isInline
                    coinType="sweepies"
                    className="font-semibold text-amber-600 dark:text-amber-400"
                  />{' '}
                  to redeem
                </span>
              ) : null}
            </span>
            <span>
              <span
                className={clsx(
                  'font-semibold',
                  allDisabled ? '' : 'text-green-600 dark:text-green-500'
                )}
              >
                ${((1 - CHARITY_FEE) * redeemableCash).toFixed(2)}
              </span>{' '}
              value
            </span>
          </Row>
        </Col>
      </Col>
    </Col>
  )
}
