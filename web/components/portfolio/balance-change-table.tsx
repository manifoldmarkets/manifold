import dayjs from 'dayjs'
import { Col } from 'web/components/layout/col'
import {
  formatMoney,
  formatMoneyUSD,
  formatSpice,
  formatSweepies,
  formatWithToken,
  maybePluralize,
} from 'common/util/format'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { User } from 'common/user'
import { ReactNode, useState } from 'react'
import { DAY_MS } from 'common/util/time'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  isBetChange,
  isTxnChange,
  TxnBalanceChange,
} from 'common/balance-change'
import Link from 'next/link'
import {
  FaArrowRightArrowLeft,
  FaArrowTrendDown,
  FaArrowTrendUp,
  FaBackward,
} from 'react-icons/fa6'
import { contractPathWithoutContract } from 'common/contract'
import { linkClass } from 'web/components/widgets/site-link'
import { ScaleIcon } from '@heroicons/react/outline'
import { Input } from 'web/components/widgets/input'
import { customFormatTime, formatJustDateShort } from 'client-common/lib/time'
import { assertUnreachable } from 'common/util/types'
import { AnyTxnCategory } from 'common/txn'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from 'web/components/buttons/button'
import { Modal } from '../layout/modal'
import { QuestType } from 'common/quest'
import { PROFIT_FEE_FRACTION } from 'common/economy'

export const BalanceChangeTable = (props: { user: User }) => {
  const { user } = props

  const [before, setBefore] = useState<number | undefined>(undefined)
  const [after, setAfter] = useState(
    dayjs().startOf('day').subtract(14, 'day').valueOf()
  )

  const { data: allBalanceChanges } = useAPIGetter('get-balance-changes', {
    userId: user.id,
    before,
    after,
  })

  const [query, setQuery] = useState('')
  const { data: cashouts } = useAPIGetter('get-cashouts', {
    userId: user.id,
  })
  const [showCashoutModal, setShowCashoutModal] = useState(false)
  const balanceChanges = (allBalanceChanges ?? []).filter((change) => {
    const { type } = change
    const contractQuestion =
      ('contract' in change && change.contract?.question) || ''
    const changeType = type
    const userName = 'user' in change ? change.user?.name ?? '' : ''
    const userUsername = 'user' in change ? change.user?.username ?? '' : ''
    const answerText = 'answer' in change ? change.answer?.text ?? '' : ''
    const betText = 'bet' in change ? betChangeToText(change) : ''
    return (
      contractQuestion.toLowerCase().includes(query.toLowerCase()) ||
      changeType.toLowerCase().includes(query.toLowerCase()) ||
      (txnTypeToDescription(changeType) || '')
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      answerText.toLowerCase().includes(query.toLowerCase()) ||
      ((isTxnChange(change) && txnTitle(change)) || '')
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      userName.toLowerCase().includes(query.toLowerCase()) ||
      userUsername.toLowerCase().includes(query.toLowerCase()) ||
      betText.toLowerCase().includes(query.toLowerCase())
    )
  })
  const pendingCashouts =
    cashouts?.filter((c) => c.txn.gidxStatus === 'Pending')?.length ?? 0
  return (
    <Col className={'w-full justify-center gap-4 py-1'}>
      <Input
        type={'text'}
        placeholder={'Search your balance changes'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Row className="flex-wrap justify-between gap-2">
        <Row className="items-center gap-2">
          <Input
            type="date"
            className="dark:date-range-input-white text-ink-700 !h-8 w-[120px] !px-2 !py-1 text-sm"
            value={dayjs(after).format('YYYY-MM-DD')}
            max={before ? dayjs(before).format('YYYY-MM-DD') : undefined}
            onChange={(e) =>
              setAfter(dayjs(e.target.value).startOf('day').valueOf())
            }
          />
          <span className="text-ink-700 text-sm">to</span>
          <Input
            type="date"
            className="dark:date-range-input-white text-ink-700 !h-8 w-[120px] !px-2 !py-1 text-sm"
            value={before ? dayjs(before).format('YYYY-MM-DD') : ''}
            min={dayjs(after).format('YYYY-MM-DD')}
            onChange={(e) =>
              setBefore(
                e.target.value
                  ? dayjs(e.target.value).endOf('day').valueOf()
                  : undefined
              )
            }
          />
        </Row>
        {cashouts && cashouts.length > 0 && (
          <Button
            color="gray-outline"
            size="xs"
            onClick={() => setShowCashoutModal(true)}
          >
            View {maybePluralize('redemption', cashouts?.length ?? 0)}{' '}
            {pendingCashouts > 0 ? `(${pendingCashouts} pending)` : ''}
          </Button>
        )}
      </Row>
      {!!before && before < Date.now() && (
        <Row className="text-ink-400 mt-4 items-center justify-center gap-6">
          <div className="border-ink-400 grow border" />
          <span>Cutoff: {formatJustDateShort(before)}</span>
          <span className="flex gap-2">
            <button
              className="text-primary-500 hover:underline"
              onClick={() => setBefore(before + 7 * DAY_MS)}
            >
              Load 1W
            </button>
            <button
              className="text-primary-500 hover:underline"
              onClick={() => setBefore(undefined)}
            >
              Clear
            </button>
          </span>
          <div className="border-ink-400 grow border" />
        </Row>
      )}

      <RenderBalanceChanges
        avatarSize={'md'}
        balanceChanges={balanceChanges}
        user={user}
        hideBalance={!!query}
      />
      <Row className="text-ink-400 mt-4 items-center justify-center gap-6">
        <div className="border-ink-400 grow border" />
        <span>Cutoff: {formatJustDateShort(after)}</span>
        <span className="flex gap-2">
          <button
            className="text-primary-500 hover:underline"
            onClick={() => setAfter(after - 7 * DAY_MS)}
          >
            Load 1W
          </button>
          <button
            className="text-primary-500 hover:underline"
            onClick={() => setAfter(after - 30 * DAY_MS)}
          >
            1M
          </button>
          <button
            className="text-primary-500 hover:underline"
            onClick={() => setAfter(after - 365 * DAY_MS)}
          >
            1Y
          </button>
        </span>
        <div className="border-ink-400 grow border" />
      </Row>

      <Modal open={showCashoutModal} setOpen={setShowCashoutModal}>
        <Col className={'bg-canvas-0 gap-4 rounded-md p-4'}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Amount</th>
                <th className="text-left">Date</th>
                <th className="text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {cashouts?.map((cashout) => (
                <tr key={cashout.txn.id}>
                  <td>{formatMoneyUSD(cashout.txn.payoutInDollars, true)}</td>
                  <td className="whitespace-nowrap">
                    {new Date(cashout.txn.createdTime).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap">
                    {cashout.txn.gidxStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Col>
      </Modal>
    </Col>
  )
}

function RenderBalanceChanges(props: {
  balanceChanges: AnyBalanceChangeType[]
  user: User
  avatarSize: 'sm' | 'md'
  hideBalance?: boolean
}) {
  const { balanceChanges, user, avatarSize, hideBalance } = props
  let currManaBalance = user.balance
  let currCashBalance = user.cashBalance
  let currSpiceBalance = user.spiceBalance
  const balanceRunningTotals = [
    { mana: currManaBalance, cash: currCashBalance, spice: currSpiceBalance },
    ...balanceChanges.map((change) => {
      if (isTxnChange(change) && change.token === 'SPICE') {
        currSpiceBalance -= change.amount
      } else if (
        isTxnChange(change)
          ? change.token === 'CASH'
          : change.contract.token === 'CASH'
      ) {
        currCashBalance -= change.amount
      } else {
        currManaBalance -= change.amount
      }
      return {
        mana: currManaBalance,
        cash: currCashBalance,
        spice: currSpiceBalance,
      }
    }),
  ]

  return (
    <>
      {balanceChanges.map((change, i) => {
        if (isBetChange(change)) {
          return (
            <BetBalanceChangeRow
              key={change.key}
              change={change}
              balance={balanceRunningTotals[i]}
              avatarSize={avatarSize}
              hideBalance={hideBalance}
              token={change.contract.token}
            />
          )
        } else if (isTxnChange(change)) {
          return (
            <TxnBalanceChangeRow
              key={change.key}
              change={change as TxnBalanceChange}
              balance={balanceRunningTotals[i]}
              avatarSize={avatarSize}
              hideBalance={hideBalance}
            />
          )
        } else {
          assertUnreachable(change)
        }
      })}
    </>
  )
}

export function ChangeIcon(props: {
  slug: string | undefined
  symbol: string | ReactNode
  className: string
  avatarSize: 'sm' | 'md'
}) {
  const { symbol, slug, avatarSize, className } = props
  const image = (
    <>
      <div
        className={clsx(
          avatarSize === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
          'rounded-full',
          className
        )}
      />
      <div
        className="absolute  self-center text-lg"
        style={{
          top: '50%',
          right: '50%',
          transform: 'translate(50%, -50%)',
        }}
      >
        {symbol}
      </div>
    </>
  )

  return (
    <div className="relative">
      {slug ? (
        <Link href={slug} onClick={(e) => e.stopPropagation}>
          {image}
        </Link>
      ) : (
        image
      )}
    </div>
  )
}

const BetBalanceChangeRow = (props: {
  change: BetBalanceChange
  balance: { mana: number; cash: number }
  avatarSize: 'sm' | 'md'
  hideBalance?: boolean
  token: 'MANA' | 'CASH'
}) => {
  const { change, balance, avatarSize, hideBalance, token } = props
  const { amount, contract, answer, bet, type } = change
  const { outcome } = bet
  const { slug, question, creatorUsername } = contract
  const niceAmount = formatWithToken({
    amount: Math.abs(amount),
    token: token === 'MANA' ? 'M$' : 'CASH',
    short: true,
  })
  const direction =
    type === 'redeem_shares'
      ? 'sideways'
      : type === 'sell_shares' && outcome === 'YES'
      ? 'down'
      : type === 'sell_shares' && outcome === 'NO'
      ? 'up'
      : outcome === 'YES'
      ? 'up'
      : 'down'
  return (
    <Row className={'gap-2'}>
      <Col className={'mt-0.5'}>
        <ChangeIcon
          avatarSize={avatarSize}
          slug={
            slug
              ? contractPathWithoutContract(creatorUsername, slug)
              : undefined
          }
          symbol={
            type === 'loan_payment' ? (
              '🏦'
            ) : (
              <div>
                {direction === 'up' ? (
                  <FaArrowTrendUp className={'h-5 w-5 '} />
                ) : direction === 'down' ? (
                  <FaArrowTrendDown className={'h-5 w-5'} />
                ) : (
                  <FaArrowRightArrowLeft className={'h-4 w-4'} />
                )}
              </div>
            )
          }
          className={
            direction === 'up'
              ? 'bg-teal-500'
              : direction === 'down'
              ? 'bg-scarlet-400'
              : 'bg-blue-400'
          }
        />
      </Col>
      <Col className={'w-full overflow-x-hidden'}>
        <Row className={'justify-between gap-2'}>
          {slug ? (
            <Link
              href={contractPathWithoutContract(creatorUsername, slug)}
              className={clsx('line-clamp-2', linkClass)}
            >
              {question}
            </Link>
          ) : (
            <div className={clsx('line-clamp-2')}>{question}</div>
          )}
          <span
            className={clsx(
              'inline-flex whitespace-nowrap',
              amount > 0 ? 'text-teal-700' : 'text-ink-600'
            )}
          >
            {amount > 0 ? '+' : '-'}
            {niceAmount}
          </span>
        </Row>
        <Row>
          <div className={clsx('text-ink-600 line-clamp-1')}>
            {betChangeToText(change)} {answer ? ` on ${answer.text}` : ''}
          </div>
        </Row>
        <Row className={'text-ink-600'}>
          {!hideBalance && (
            <>
              {token === 'CASH'
                ? formatSweepies(balance.cash)
                : formatMoney(balance.mana)}
              {'·'}
            </>
          )}{' '}
          {customFormatTime(change.createdTime)}
        </Row>
      </Col>
    </Row>
  )
}

const TxnBalanceChangeRow = (props: {
  change: TxnBalanceChange
  balance: { mana: number; cash: number; spice: number }
  avatarSize: 'sm' | 'md'
  hideBalance?: boolean
}) => {
  const { change, balance, avatarSize, hideBalance } = props
  const { contract, amount, type, token, user, charity, description } = change

  const reasonToBgClassNameMap: Partial<{
    [key in AnyTxnCategory]: string
  }> = {
    QUEST_REWARD: 'bg-amber-400',
    BETTING_STREAK_BONUS: 'bg-red-400',
    CREATE_CONTRACT_ANTE: 'bg-indigo-400',
    CONTRACT_RESOLUTION_PAYOUT: 'bg-yellow-200',
    CONTRACT_UNDO_RESOLUTION_PAYOUT: 'bg-canvas-100',
    PRODUCE_SPICE: 'bg-yellow-200',
    CONTRACT_UNDO_PRODUCE_SPICE: 'bg-ink-1000',
    CONSUME_SPICE: 'bg-indigo-400',
    CONSUME_SPICE_DONE: 'bg-indigo-400',
    CONVERT_CASH: 'bg-indigo-400',
    CONVERT_CASH_DONE: 'bg-indigo-400',
    SIGNUP_BONUS: 'bg-yellow-200',
    KYC_BONUS: 'bg-yellow-200',
    REFERRAL: 'bg-blue-300',
    MANA_PURCHASE: 'bg-gradient-to-br from-blue-400 via-green-100 to-green-300',
    CASH_BONUS: 'bg-gradient-to-br from-blue-400 via-green-100 to-green-300',
    MARKET_BOOST_REDEEM: 'bg-purple-200',
    MARKET_BOOST_CREATE: 'bg-purple-400',
    LEAGUE_PRIZE: 'bg-indigo-400',
    BOUNTY_POSTED: 'bg-indigo-400',
    BOUNTY_AWARDED: 'bg-teal-600',
    MANA_PAYMENT: 'bg-teal-400',
    LOAN: 'bg-amber-500',
    CASH_OUT: 'bg-amber-500',
    CONTRACT_BOOST_PURCHASE: 'bg-scarlet-400',
    ADD_SUBSIDY: 'bg-red-100',
    UNIQUE_BETTOR_BONUS: 'bg-sky-400',
    PUSH_NOTIFICATION_BONUS: 'bg-pink-400',
    CHARITY: 'bg-gradient-to-br from-pink-300 via-purple-300 to-primary-400',
    CONTRACT_RESOLUTION_FEE:
      'bg-gradient-to-br from-pink-300 via-purple-300 to-primary-400',
    UNDO_CONTRACT_RESOLUTION_FEE: 'bg-canvas-100',
    ADMIN_REWARD:
      'bg-gradient-to-br from-pink-300 via-purple-300 to-primary-400',
  }

  return (
    <Row className={'gap-2'}>
      <Col className={'mt-0.5'}>
        <ChangeIcon
          avatarSize={avatarSize}
          slug={
            contract?.slug
              ? contractPathWithoutContract(
                  contract.creatorUsername,
                  contract.slug
                )
              : user?.username
          }
          symbol={
            type === 'MANA_PAYMENT' ? (
              '💸'
            ) : type === 'MARKET_BOOST_CREATE' ||
              type === 'CONTRACT_BOOST_PURCHASE' ? (
              '🚀'
            ) : type === 'ADD_SUBSIDY' ? (
              '💧'
            ) : type === 'CONTRACT_RESOLUTION_PAYOUT' ||
              type === 'PRODUCE_SPICE' ? (
              '🎉'
            ) : type === 'CONTRACT_UNDO_RESOLUTION_PAYOUT' ||
              type === 'CONTRACT_UNDO_PRODUCE_SPICE' ||
              type === 'UNDO_CONTRACT_RESOLUTION_FEE' ? (
              <FaBackward className={'h-5 w-5 text-white'} />
            ) : type === 'CREATE_CONTRACT_ANTE' || type === 'BOUNTY_POSTED' ? (
              <ScaleIcon className={'-ml-[1px] mb-1 h-5 w-5'} />
            ) : type === 'CONSUME_SPICE' ||
              type === 'CONSUME_SPICE_DONE' ||
              type === 'CONVERT_CASH' ||
              type === 'CONVERT_CASH_DONE' ? (
              <FaArrowRightArrowLeft className={'h-4 w-4'} />
            ) : type === 'CHARITY' ||
              type === 'REFERRAL' ||
              type === 'ADMIN_REWARD' ? (
              '❤️'
            ) : type === 'LOAN' ||
              type === 'CASH_OUT' ||
              type === 'CONTRACT_RESOLUTION_FEE' ? (
              '🏦'
            ) : type === 'MANA_PURCHASE' ? (
              '🤑'
            ) : [
                'UNIQUE_BETTOR_BONUS',
                'CASH_BONUS',
                'BETTING_STREAK_BONUS',
                'SIGNUP_BONUS',
                'KYC_BONUS',
                'QUEST_REWARD',
                'MARKET_BOOST_REDEEM',
                'LEAGUE_PRIZE',
                'BOUNTY_AWARDED',
                'PUSH_NOTIFICATION_BONUS',
              ].includes(type) ? (
              '🎁'
            ) : (
              ''
            )
          }
          className={reasonToBgClassNameMap[type] ?? 'bg-canvas-100'}
        />
      </Col>
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          {contract && contract.slug ? (
            <Link
              href={contractPathWithoutContract(
                contract.creatorUsername,
                contract.slug
              )}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : user ? (
            <Link
              href={'/' + user.username}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : charity ? (
            <Link
              href={`/charity/${charity.slug}`}
              className={clsx('line-clamp-2', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : (
            <div className={clsx('line-clamp-2')}>{txnTitle(change)}</div>
          )}

          <span
            className={clsx(
              'shrink-0',
              amount > 0 ? 'text-teal-700' : 'text-ink-600'
            )}
          >
            {amount > 0 ? '+' : '-'}
            {token === 'SPICE'
              ? formatSpice(amount).replace('-', '')
              : token === 'CASH'
              ? formatSweepies(amount).replace('-', '')
              : formatMoney(amount).replace('-', '')}
          </span>
        </Row>
        <div className={'text-ink-600'}>
          {txnTypeToDescription(type) ?? description ?? type}
        </div>
        <Row className={'text-ink-600'}>
          {!hideBalance && (
            <>
              {token === 'SPICE'
                ? formatSpice(balance.spice)
                : token === 'CASH'
                ? formatSweepies(balance.cash)
                : formatMoney(balance.mana)}
              {' · '}
            </>
          )}
          {customFormatTime(change.createdTime)}
        </Row>
      </Col>
    </Row>
  )
}

const betChangeToText = (change: BetBalanceChange) => {
  const { type, bet } = change
  const { outcome } = bet
  return type === 'redeem_shares'
    ? `Redeem shares`
    : type === 'loan_payment'
    ? `Pay back loan`
    : type === 'fill_bet'
    ? `Fill ${outcome} order`
    : type === 'sell_shares'
    ? `Sell ${outcome} shares`
    : `Buy ${outcome}`
}

const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, user, questType, charity, answerText } = change

  if (user) {
    return user.username
  }
  if (charity) {
    return charity.name
  }
  if (answerText) {
    return answerText
  }
  if (contract) {
    return contract.question
  }

  switch (type) {
    case 'QUEST_REWARD':
      return questType ? questTypeToDescription(questType) : ''
    case 'BETTING_STREAK_BONUS':
      return 'Prediction streak bonus' // usually the question instead
    case 'ADMIN_REWARD':
      return 'Mod task completed'
    case 'LOAN':
      return 'Loan'
    case 'LEAGUE_PRIZE':
      return 'League prize'
    case 'MANA_PURCHASE':
      return 'Mana purchase'
    case 'MARKET_BOOST_REDEEM':
      return 'Claim boost'
    case 'SIGNUP_BONUS':
      return change.description ?? 'Signup bonus'
    case 'REFERRAL':
      return 'Referral bonus'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
      return `Redeem prize points for mana`
    case 'CONVERT_CASH':
    case 'CONVERT_CASH_DONE':
      return 'Redeem sweepcash for mana'
    case 'CASH_OUT':
      return 'Redemption request'
    case 'CASH_BONUS':
      return 'Sweepcash bonus'
    case 'KYC_BONUS':
      return 'ID verification bonus'
    case 'CONTRACT_RESOLUTION_FEE':
    case 'UNDO_CONTRACT_RESOLUTION_FEE':
      return ''
    default:
      return type
  }
}

const txnTypeToDescription = (txnCategory: string) => {
  switch (txnCategory) {
    case 'MARKET_BOOST_CREATE':
      return 'Boost'
    case 'CANCEL_UNIQUE_BETTOR_BONUS':
      return 'Cancel unique trader bonus'
    case 'PRODUCE_SPICE':
    case 'CONTRACT_RESOLUTION_PAYOUT':
      return 'Payout'
    case 'CREATE_CONTRACT_ANTE':
      return 'Ante'
    case 'UNIQUE_BETTOR_BONUS':
      return 'Trader bonus'
    case 'BETTING_STREAK_BONUS':
      return 'Quests'
    case 'SIGNUP_BONUS':
    case 'KYC_BONUS':
      return 'New user bonuses'
    case 'REFERRAL':
      return 'Quests'
    case 'ADMIN_REWARD':
      return 'Thank you!'
    case 'QUEST_REWARD':
      return 'Quests'
    case 'CONTRACT_UNDO_PRODUCE_SPICE':
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return 'Unresolve'
    case 'CONSUME_SPICE':
    case 'CONSUME_SPICE_DONE':
    case 'CONVERT_CASH':
    case 'CONVERT_CASH_DONE':
      return ''
    case 'CONTRACT_RESOLUTION_FEE':
      return `${PROFIT_FEE_FRACTION * 100}% fee on profit at resolution`
    case 'UNDO_CONTRACT_RESOLUTION_FEE':
      return `Undo ${PROFIT_FEE_FRACTION * 100}% profit fee at resolution`
    case 'MANA_PURCHASE':
      return ''
    case 'ADD_SUBSIDY':
      return 'Subsidy'
    case 'MARKET_BOOST_REDEEM':
      return 'Leagues'
    case 'BOUNTY_POSTED':
      return 'Ante'
    case 'BOUNTY_AWARDED':
      return 'Bounty awarded'
    case 'MANA_PAYMENT':
      return 'User payment'
    case 'CHARITY':
      return 'Donation'
    case 'LOAN':
      return ''
    default:
      return null
  }
}

const questTypeToDescription = (questType: QuestType) => {
  switch (questType) {
    case 'SHARES':
      return 'Sharing bonus'
    case 'MARKETS_CREATED':
      return 'Creation bonus'
    default:
      return 'questType'
  }
}
