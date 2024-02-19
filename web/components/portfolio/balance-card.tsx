import { Col } from 'web/components/layout/col'
import {
  formatMoney,
  getMoneyNumber,
  shortFormatNumber,
} from 'common/util/format'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { User } from 'common/user'
import { ReactNode, useState } from 'react'
import { orderBy, sumBy } from 'lodash'
import { DAY_MS } from 'common/util/time'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  TXN_BALANCE_CHANGE_TYPES,
  TxnBalanceChange,
  TxnType,
} from 'common/balance-change'
import Link from 'next/link'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  FaArrowRightArrowLeft,
  FaArrowTrendDown,
  FaArrowTrendUp,
} from 'react-icons/fa6'
import { contractPathWithoutContract } from 'common/contract'
import { linkClass } from 'web/components/widgets/site-link'
import { Avatar } from 'web/components/widgets/avatar'
import { ScaleIcon } from '@heroicons/react/outline'
import { QuestType } from 'common/quest'
import { Input } from 'web/components/widgets/input'

export const BalanceCard = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  onSeeChanges: () => void
  className?: string
}) => {
  const { user, className, onSeeChanges } = props
  const balanceChanges = props.balanceChanges.filter(
    (b) => getMoneyNumber(b.amount) !== 0
  )
  const [showAddFunds, setShowAddFunds] = useState(false)
  const spentToday = sumBy(
    balanceChanges.filter(
      (change) => change.createdTime > Date.now() - DAY_MS && change.amount < 0
    ),
    'amount'
  )
  const earnedToday = sumBy(
    balanceChanges.filter(
      (change) => change.createdTime > Date.now() - DAY_MS && change.amount > 0
    ),
    'amount'
  )
  const previewChanges = balanceChanges.slice(0, 3)
  const moreChanges = Math.max(balanceChanges.length - previewChanges.length, 0)
  return (
    <Row className={className} onClick={onSeeChanges}>
      <Col className={'w-full gap-1.5'}>
        <Col>
          <div className={'text-ink-800 text-5xl sm:text-5xl'}>
            {formatMoney(user.balance)}
          </div>
          <div className={'text-ink-800 ml-1 w-full flex-wrap gap-2'}>
            Your balance
          </div>
        </Col>
        <Row className={'text-ink-600 mb-1 ml-1 gap-1'}>
          {formatMoney(earnedToday)} in &{' '}
          {formatMoney(spentToday).replace('-', '')} out today
        </Row>
        {previewChanges.length > 0 && (
          <Col className={'border-ink-200 gap-2 border-t pt-3'}>
            <RenderBalanceChanges
              balanceChanges={previewChanges}
              user={user}
              avatarSize={'sm'}
            />
            {moreChanges > 0 && (
              <Row className={'justify-end'}>
                <Button
                  color={'gray-white'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSeeChanges()
                  }}
                >
                  See {moreChanges} more changes
                </Button>
              </Row>
            )}
          </Col>
        )}
      </Col>
      <div className={'absolute right-1 top-1'}>
        <Button
          color="gray-outline"
          onClick={(e) => {
            e.stopPropagation()
            setShowAddFunds(true)
          }}
          size="2xs"
          className={'whitespace-nowrap'}
        >
          Add funds
        </Button>
        <AddFundsModal open={showAddFunds} setOpen={setShowAddFunds} />
      </div>
    </Row>
  )
}

export const BalanceChangeTable = (props: {
  user: User
  balanceChanges: TxnBalanceChange[] | BetBalanceChange[]
}) => {
  const { user } = props
  const [query, setQuery] = useState('')
  const balanceChanges = props.balanceChanges.filter((change) => {
    const { type, contract } = change
    const contractQuestion = contract?.question ?? ''
    const changeType = type
    const userName = 'user' in change ? change.user?.name ?? '' : ''
    const userUsername = 'user' in change ? change.user?.username ?? '' : ''
    const answerText = 'answer' in change ? change.answer?.text ?? '' : ''
    const betText = 'bet' in change ? betChangeToText(change) : ''
    return (
      contractQuestion.toLowerCase().includes(query.toLowerCase()) ||
      changeType.toLowerCase().includes(query.toLowerCase()) ||
      txnTypeToDescription(changeType)
        .toLowerCase()
        .includes(query.toLowerCase()) ||
      answerText.toLowerCase().includes(query.toLowerCase()) ||
      (txnTitle(change) ?? '').toLowerCase().includes(query.toLowerCase()) ||
      userName.toLowerCase().includes(query.toLowerCase()) ||
      userUsername.toLowerCase().includes(query.toLowerCase()) ||
      betText.toLowerCase().includes(query.toLowerCase())
    )
  })
  return (
    <Col className={' w-full justify-center'}>
      <Input
        type={'text'}
        placeholder={'Search your balance changes'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Col className={'gap-4 px-3 pt-4'}>
        <RenderBalanceChanges
          avatarSize={'md'}
          balanceChanges={balanceChanges}
          user={user}
        />
      </Col>
    </Col>
  )
}
function RenderBalanceChanges(props: {
  balanceChanges: AnyBalanceChangeType[]
  user: User
  avatarSize: 'sm' | 'md'
}) {
  const { balanceChanges, user, avatarSize } = props
  let currBalance = user.balance
  const balanceRunningTotals = [
    currBalance,
    ...balanceChanges.map((change) => {
      currBalance -= change.amount
      return currBalance
    }),
  ]
  return (
    <>
      {orderBy(balanceChanges, 'createdTime', 'desc').map((change, i) => {
        const { type } = change

        if (
          [
            'sell_shares',
            'create_bet',
            'redeem_shares',
            'fill_bet',
            'loan_payment',
          ].includes(type)
        ) {
          return (
            <BetBalanceChangeRow
              key={change.key ?? change.createdTime + change.amount + type}
              change={change as BetBalanceChange}
              balance={balanceRunningTotals[i]}
              avatarSize={avatarSize}
            />
          )
        } else if (TXN_BALANCE_CHANGE_TYPES.includes(type)) {
          return (
            <TxnBalanceChangeRow
              key={change.key ?? change.createdTime + change.amount + type}
              change={change as TxnBalanceChange}
              balance={balanceRunningTotals[i]}
              avatarlUrl={user.avatarUrl}
              avatarSize={avatarSize}
            />
          )
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
const BetBalanceChangeRow = (props: {
  change: BetBalanceChange
  balance: number
  avatarSize: 'sm' | 'md'
}) => {
  const { change, balance, avatarSize } = props
  const { amount, contract, answer, bet, type } = change
  const { outcome } = bet
  const { slug, question, creatorUsername } = contract
  const niceAmount =
    ENV_CONFIG.moneyMoniker + shortFormatNumber(amount).replace('-', '')
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
            {formatMoney(balance)} {change && '·'} {betChangeToText(change)}
            {answer ? ` on ${answer.text}` : ''}
          </div>
        </Row>
      </Col>
    </Row>
  )
}

const TxnBalanceChangeRow = (props: {
  change: TxnBalanceChange
  balance: number
  avatarlUrl: string
  avatarSize: 'sm' | 'md'
}) => {
  const { change, balance, avatarSize, avatarlUrl } = props
  const { contract, amount, type, user: changeUser } = change
  const reasonToBgClassNameMap: {
    [key in TxnType]: string
  } = {
    QUEST_REWARD: 'bg-amber-400',
    BETTING_STREAK_BONUS: 'bg-red-400',
    CREATE_CONTRACT_ANTE: 'bg-indigo-400',
    CONTRACT_RESOLUTION_PAYOUT: 'bg-yellow-200',
    CONTRACT_UNDO_RESOLUTION_PAYOUT: 'bg-ink-1000',
    SIGNUP_BONUS: 'bg-yellow-200',
    STARTING_BALANCE: 'bg-yellow-200',
    MARKET_BOOST_REDEEM: 'bg-purple-200',
    MARKET_BOOST_CREATE: 'bg-purple-400',
    LEAGUE_PRIZE: 'bg-indigo-400',
    BOUNTY_POSTED: 'bg-indigo-400',
    BOUNTY_AWARDED: 'bg-teal-600',
    MANA_PAYMENT: 'bg-teal-400',
    LOAN: 'bg-amber-500',
    ADD_SUBSIDY: 'bg-red-100',
    UNIQUE_BETTOR_BONUS: 'bg-sky-400',
  }
  return (
    <Row className={'gap-2'}>
      <Col className={'mt-0.5'}>
        {type === 'STARTING_BALANCE' ? (
          <Avatar
            className={''}
            avatarUrl={avatarlUrl}
            noLink={true}
            size={avatarSize}
          />
        ) : (
          <ChangeIcon
            avatarSize={avatarSize}
            slug={
              contract?.slug
                ? contractPathWithoutContract(
                    contract.creatorUsername,
                    contract.slug
                  )
                : changeUser?.username
            }
            symbol={
              type === 'MANA_PAYMENT' ? (
                '💸'
              ) : type === 'MARKET_BOOST_CREATE' ? (
                '🚀'
              ) : type === 'ADD_SUBSIDY' ? (
                '💰'
              ) : type === 'CONTRACT_RESOLUTION_PAYOUT' ? (
                '🎉'
              ) : type === 'CREATE_CONTRACT_ANTE' ||
                type === 'BOUNTY_POSTED' ? (
                <ScaleIcon className={'-ml-[1px] mb-1 h-5 w-5'} />
              ) : (
                '🎁'
              )
            }
            className={reasonToBgClassNameMap[type]}
          />
        )}
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
          ) : changeUser ? (
            <Link
              href={'/' + changeUser.username}
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
            {formatMoney(amount).replace('-', '')}
          </span>
        </Row>
        <Row className={'text-ink-600'}>
          {formatMoney(balance)} {txnTypeToDescription(type) && '·'}{' '}
          {txnTypeToDescription(type)}
        </Row>
      </Col>
    </Row>
  )
}

const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, user, questType } = change

  if (user) {
    return user.username
  }
  switch (type) {
    case 'QUEST_REWARD':
      return questType ? questTypeToDescription(questType) : ''
    case 'BETTING_STREAK_BONUS':
      return !contract ? 'Prediction streak bonus' : contract?.question
    case 'LOAN':
      return 'Loan'
    case 'MARKET_BOOST_REDEEM':
      return 'Claim boost'
    case 'SIGNUP_BONUS':
      return 'Question exploration bonus'
    case 'STARTING_BALANCE':
      return 'Starting balance'
    default:
      return contract?.question
  }
}

const txnTypeToDescription = (txnCategory: TxnType) => {
  switch (txnCategory) {
    case 'MARKET_BOOST_CREATE':
      return 'Boost'
    case 'CONTRACT_RESOLUTION_PAYOUT':
      return 'Payout'
    case 'CREATE_CONTRACT_ANTE':
      return 'Ante'
    case 'UNIQUE_BETTOR_BONUS':
      return 'Trader bonus'
    case 'BETTING_STREAK_BONUS':
      return 'Quests'
    case 'SIGNUP_BONUS':
      return 'Quests'
    case 'QUEST_REWARD':
      return 'Quests'
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return 'Unresolve'
    case 'STARTING_BALANCE':
      return ''
    case 'MARKET_BOOST_REDEEM':
      return ''
    case 'ADD_SUBSIDY':
      return 'Subsidy'
    case 'LEAGUE_PRIZE':
      return 'Leagues'
    case 'BOUNTY_POSTED':
      return 'Ante'
    case 'BOUNTY_AWARDED':
      return 'Bounty awarded'
    case 'MANA_PAYMENT':
      return 'User payment'
    case 'LOAN':
      return ''
    default:
      return txnCategory
  }
}

const questTypeToDescription = (questType: QuestType) => {
  switch (questType) {
    case 'SHARES':
      return 'Sharing bonus'
    case 'MARKETS_CREATED':
      return 'Creation bonus'
    case 'REFERRALS':
      return 'Referral bonus'
    default:
      return 'questType'
  }
}
