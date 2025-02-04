import clsx from 'clsx'
import { MIN_CASHOUT_AMOUNT, SWEEPIES_CASHOUT_FEE } from 'common/economy'
import {
  CASH_TO_MANA_CONVERSION_RATE,
  CHARITY_FEE,
  SWEEPIES_NAME,
  TWOMBA_CASHOUT_ENABLED,
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
import { CashoutPagesType } from 'web/pages/redeem'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { TokenNumber } from '../widgets/token-number'
import { formatMoney, formatMoneyUSD, formatSweepies } from 'common/util/format'
import { ReactNode, useState } from 'react'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { UncontrolledTabs } from '../layout/tabs'
import { PendingCashoutStatusData } from 'common/gidx/gidx'
import { PaginationNextPrev } from '../widgets/pagination'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import { Spacer } from '../layout/spacer'
import { useNativeInfo } from '../native-message-provider'
import { firebaseLogin } from 'web/lib/firebase/users'

export const CASHOUTS_PER_PAGE = 10

export function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'complete':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100 '
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-ink-100 text-ink-800 dark:bg-ink-200'
  }
}

export function SelectCashoutOptions(props: {
  user: User
  redeemableCash: number
  redeemForUSDPageName: CashoutPagesType
  setPage: (page: CashoutPagesType) => void
  allDisabled?: boolean
}) {
  const { user, allDisabled } = props

  const [cashoutPage, setCashoutPage] = useState(0)

  const { data: cashouts } = useAPIGetter('get-cashouts', {
    limit: CASHOUTS_PER_PAGE,
    offset: cashoutPage * CASHOUTS_PER_PAGE,
    userId: user.id,
  })

  if (!cashouts || (cashouts.length === 0 && cashoutPage === 0)) {
    return <CashoutOptionsContent {...props} />
  }

  return (
    <Col
      className={clsx('w-full gap-4', allDisabled && 'text-ink-700 opacity-80')}
    >
      <UncontrolledTabs
        tabs={[
          {
            title: 'Redemption Options',
            content: <CashoutOptionsContent {...props} />,
          },
          {
            title: 'Cashout History',
            content: (
              <Col className="w-full overflow-auto">
                <table className="w-full border-collapse select-none">
                  <thead>
                    <tr className="text-ink-600 bg-canvas-50">
                      <th className="px-3 py-2 text-left font-semibold">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-semibold">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashouts?.map((cashout: PendingCashoutStatusData) => {
                      const createdDate = new Date(
                        cashout.txn.createdTime
                      ).getTime()
                      return (
                        <tr
                          key={cashout.txn.id}
                          className="border-canvas-50 border-b"
                        >
                          <td className="px-3 py-2 ">
                            {formatMoneyUSD(cashout.txn.payoutInDollars, true)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${getStatusColor(
                                cashout.txn.gidxStatus
                              )}`}
                            >
                              {cashout.txn.gidxStatus}
                            </span>
                          </td>
                          <td className="text-ink-500 whitespace-nowrap px-3 py-2">
                            <DateTimeTooltip time={createdDate}>
                              {shortenedFromNow(createdDate)}
                            </DateTimeTooltip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <Spacer h={4} />
                {(cashoutPage > 0 || cashouts.length == CASHOUTS_PER_PAGE) && (
                  <PaginationNextPrev
                    isStart={cashoutPage === 0}
                    isEnd={cashouts.length < CASHOUTS_PER_PAGE}
                    isLoading={false}
                    isComplete={true}
                    getPrev={() => setCashoutPage(cashoutPage - 1)}
                    getNext={() => setCashoutPage(cashoutPage + 1)}
                  />
                )}
              </Col>
            ),
          },
        ]}
      />
    </Col>
  )
}

function CashoutOptionsContent(props: {
  user: User
  redeemableCash: number
  redeemForUSDPageName: CashoutPagesType
  setPage: (page: CashoutPagesType) => void
  allDisabled?: boolean
}) {
  const { setPage, allDisabled, redeemableCash, redeemForUSDPageName } = props
  const { isNative, platform } = useNativeInfo()
  const isNativeIOS = isNative && platform === 'ios'

  const noHasMinRedeemableCash = redeemableCash < MIN_CASHOUT_AMOUNT
  const hasNoRedeemableCash = redeemableCash === 0
  return (
    <Col className={clsx('gap-4', allDisabled && 'text-ink-700 opacity-80')}>
      <Card className="pb-1">
        <DollarDescription disabled={allDisabled} />
        <Col className="gap-0.5">
          <Button
            className={clsx('text-xs sm:text-sm')}
            onClick={() => {
              setPage(redeemForUSDPageName)
            }}
            disabled={
              !!allDisabled || noHasMinRedeemableCash || !TWOMBA_CASHOUT_ENABLED
            }
          >
            Redeem for USD
          </Button>
          {!TWOMBA_CASHOUT_ENABLED && (
            <div className="text-ink-500 text-xs sm:text-sm">
              Cashouts should be enabled in less than a week
            </div>
          )}
          <Row className="text-ink-500 w-full justify-between gap-1 whitespace-nowrap text-xs sm:text-sm ">
            <span>
              {noHasMinRedeemableCash && !allDisabled ? (
                <span className="text-red-600 dark:text-red-400">
                  You need at least{' '}
                  <TokenNumber
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
      </Card>
      <Card className="pb-1">
        <ManaDescription disabled={allDisabled} />
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
            <TokenNumber
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
      </Card>
      {!isNativeIOS && (
        <Card className="pb-1">
          <CharityDescription disabled={allDisabled} />
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
              See eligible charities
            </Link>
            <Row className="text-ink-500 w-full justify-between gap-1 whitespace-nowrap text-xs sm:text-sm ">
              <span>
                {noHasMinRedeemableCash && !allDisabled ? (
                  <span className="text-red-600 dark:text-red-400">
                    You need at least{' '}
                    <TokenNumber
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
        </Card>
      )}
    </Col>
  )
}

// No functionality. like, for signed out view
export function CashoutOptionsExplainer() {
  return (
    <Col className="gap-4">
      <Card>
        <ManaDescription />
      </Card>
      <Card>
        <CharityDescription />
      </Card>
      <Card>
        <DollarDescription />
      </Card>
      <Button
        color="gradient-pink"
        size="2xl"
        onClick={firebaseLogin}
        className="w-full"
      >
        Get started for free!
      </Button>
    </Col>
  )
}

const Card = (props: { children: ReactNode; className?: string }) => (
  <div
    className={clsx(
      'bg-canvas-50 flex w-full flex-col gap-4 rounded-lg p-4',
      props.className
    )}
  >
    {props.children}
  </div>
)

const ManaDescription = (props: { disabled?: boolean }) => (
  <div className="flex gap-4">
    <ManaCoin className={clsx('text-7xl', props.disabled && 'grayscale')} />
    <Col>
      <div className="text-lg font-semibold">Get Mana</div>
      <div className="text-ink-700 flex flex-wrap gap-x-1 text-sm">
        Redeem {SWEEPIES_NAME} at
        <span>
          <b>
            {formatSweepies(1)} {'→'}{' '}
            {formatMoney(CASH_TO_MANA_CONVERSION_RATE)}
          </b>
          .
        </span>
      </div>
    </Col>
  </div>
)

const CharityDescription = (props: { disabled?: boolean }) => (
  <div className="flex gap-4">
    <img
      alt="donate"
      src="/images/donate.png"
      height={80}
      width={80}
      className={clsx(props.disabled && 'grayscale')}
    />
    <Col>
      <div className="text-lg font-semibold">Donate to Charity</div>
      <div className="text-ink-700 text-sm">
        Redeem {SWEEPIES_NAME} for a cash donation to a charitable cause.
      </div>
    </Col>
  </div>
)

const DollarDescription = (props: { disabled?: boolean }) => (
  <div className="flex gap-4">
    <img
      alt="cashout"
      src="/images/cash-icon.png"
      height={60}
      width={80}
      className={clsx(
        'h-[60px] w-[80px] object-contain',
        props.disabled && 'grayscale'
      )}
    />
    <Col>
      <div className="text-lg font-semibold">Redeem for USD</div>
      <div className="text-ink-700 flex flex-wrap gap-x-1 text-sm">
        Redeem {SWEEPIES_NAME} at
        <span>
          <b>
            {formatSweepies(1)} {'→'} {formatMoneyUSD(1)}
          </b>
          ,
        </span>
        <span>minus a {formatMoneyUSD(SWEEPIES_CASHOUT_FEE)} flat fee.</span>
      </div>
    </Col>
  </div>
)
