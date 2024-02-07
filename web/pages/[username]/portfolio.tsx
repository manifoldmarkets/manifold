import { getFullUserByUsername } from 'web/lib/supabase/users'
import { shouldIgnoreUserPage, User } from 'common/user'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/firebase/api'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  TXN_BALANCE_CHANGE_TYPES,
  TxnBalanceChange,
  TxnType,
} from 'common/balance-change'
import {
  formatMoney,
  getMoneyNumber,
  shortFormatNumber,
} from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { DAY_MS, WEEK_MS } from 'common/util/time'
import { orderBy, sumBy } from 'lodash'
import { QuestType } from 'common/quest'
import { ENV_CONFIG } from 'common/envs/constants'
import clsx from 'clsx'
import { SEO } from 'web/components/SEO'
import Head from 'next/head'
import { Row } from 'web/components/layout/row'
import { BackButton } from 'web/components/contract/back-button'
import { Page } from 'web/components/layout/page'
import Custom404 from 'web/pages/404'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { ReactNode, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { AddFundsModal } from 'web/components/add-funds-modal'
import { InvestmentValueCard } from 'web/components/portfolio/investment-value'
import {
  FaArrowRightArrowLeft,
  FaArrowTrendDown,
  FaArrowTrendUp,
} from 'react-icons/fa6'
import { contractPathWithoutContract } from 'common/contract'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { UserBetsTable } from 'web/components/bet/user-bets-table'
import { ScaleIcon } from '@heroicons/react/outline'

export const getStaticProps = async (props: {
  params: {
    username: string
  }
}) => {
  const { username } = props.params
  const user = await getFullUserByUsername(username)
  const shouldIgnoreUser = user ? await shouldIgnoreUserPage(user, db) : false

  const balanceChanges = user
    ? await api('get-balance-changes', {
        userId: user.id,
        after: Date.now() - WEEK_MS,
      })
    : []
  return {
    props: removeUndefinedProps({
      user,
      username,
      shouldIgnoreUser,
      balanceChanges,
    }),
    // revalidate: 60 * 5, // Regenerate after 5 minutes
    revalidate: 4,
  }
}

export const getStaticPaths = () => {
  return { paths: [], fallback: 'blocking' }
}

export default function UserPortfolio(props: {
  user: User | null
  username: string
  shouldIgnoreUser: boolean
  balanceChanges: AnyBalanceChangeType[]
}) {
  if (!props.user) return <Custom404 />
  return (
    <UserPortfolioInternal
      user={props.user}
      username={props.username}
      shouldIgnoreUser={props.shouldIgnoreUser}
      balanceChanges={props.balanceChanges}
    />
  )
}
function UserPortfolioInternal(props: {
  user: User
  username: string
  shouldIgnoreUser: boolean
  balanceChanges: AnyBalanceChangeType[]
}) {
  const { user, shouldIgnoreUser, balanceChanges } = props
  const [showBalanceChanges, setShowBalanceChanges] = useState(false)
  const [showAddFunds, setShowAddFunds] = useState(false)
  const { ref: titleRef } = useHeaderIsStuck()
  const changeToday = sumBy(
    balanceChanges.filter((change) => change.createdTime > Date.now() - DAY_MS),
    'amount'
  )
  return (
    <Page
      key={user.id}
      trackPageView={'user page'}
      trackPageProps={{ username: user.username }}
    >
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />
      {shouldIgnoreUser && (
        <Head>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
      )}

      <Col className="relative mt-1">
        <Row
          className={
            'bg-canvas-50 sticky top-0 z-10 w-full items-center justify-between gap-1 py-2 sm:gap-2'
          }
          ref={titleRef}
        >
          <BackButton />

          <Row className={'items-center gap-2'}>
            <Link
              className={clsx('text-ink-500', linkClass)}
              href={'/' + user.username}
            >
              <Row className={'items-center gap-1 px-3'}>
                Profile
                <ArrowRightIcon className={'h-5 w-5'} />
              </Row>
            </Link>
          </Row>
        </Row>
        <Col className={'mb-2 gap-4 px-2 sm:mt-4 sm:flex-row'}>
          <Row
            className={
              'bg-canvas-0 min-w-[45%] max-w-sm justify-between rounded-md p-2'
            }
          >
            <Col>
              <span className={'ml-1'}>Mana balance</span>
              <span className={'mb-1 text-5xl'}>
                {formatMoney(user.balance)}
              </span>
              <button
                color={'gray-white'}
                onClick={() => setShowBalanceChanges(true)}
              >
                <Row className={clsx('items-center')}>
                  {formatMoney(changeToday).replace('-', '')}{' '}
                  {changeToday > 0
                    ? 'earned '
                    : changeToday < 0
                    ? 'spent '
                    : ''}
                  today
                </Row>
              </button>
            </Col>
            <Col className={'items-end justify-end'}>
              <Button
                color="gray-outline"
                onClick={() => setShowAddFunds(true)}
                size="2xs"
              >
                Add funds
              </Button>
              <AddFundsModal open={showAddFunds} setOpen={setShowAddFunds} />
            </Col>
          </Row>
          <Row
            className={
              'bg-canvas-0 min-w-[45%] max-w-sm justify-between rounded-md p-2'
            }
          >
            <Col className={''}>
              <span className={'ml-1'}>Investment value</span>
              <InvestmentValueCard user={user} />
            </Col>
          </Row>
        </Col>
        <Col className={'mt-4 border-t-2 px-2 pt-4'}>
          <Row className={'mb-2 justify-between'}>
            <span className={'text-2xl'}>Your trades</span>
            {(user.creatorTraders.allTime > 0 ||
              (user.freeQuestionsCreated ?? 0) > 0) && (
              <Col className={'mb-0.5 justify-end'}>
                <Link
                  className={clsx('text-ink-500', linkClass)}
                  href={'/' + user.username + '?tab=questions'}
                >
                  <Row className={'items-center gap-1 px-3'}>See questions</Row>
                </Link>
              </Col>
            )}
          </Row>
          {/* It would be awesome to be able to search your questions here too*/}
          <UserBetsTable user={user} />
        </Col>
        {showBalanceChanges && (
          <BalanceChangesModal
            user={user}
            balanceChanges={balanceChanges}
            setOpen={() => setShowBalanceChanges(false)}
          />
        )}
      </Col>
    </Page>
  )
}

const BalanceChangesModal = (props: {
  user: User
  balanceChanges: AnyBalanceChangeType[]
  setOpen: () => void
}) => {
  const { balanceChanges, setOpen, user } = props
  const changeToday = sumBy(
    balanceChanges.filter((change) => change.createdTime > Date.now() - DAY_MS),
    'amount'
  )
  return (
    <Modal size={'lg'} open={true} setOpen={setOpen} className={MODAL_CLASS}>
      <Col className={'w-full justify-center'}>
        <Row className={'ml-2 justify-around'}>
          <Col>
            <span className={'ml-1'}>Mana balance</span>
            <span className={'mb-1 text-2xl'}>{formatMoney(user.balance)}</span>
          </Col>
          <Col>
            <span className={'ml-1'}>
              {changeToday > 0 ? 'Earned ' : 'Spent '}
              today
            </span>
            <span className={clsx('mb-1 text-2xl')}>
              {formatMoney(changeToday).replace('-', '')}
            </span>
          </Col>
        </Row>

        <Col className={'gap-4 border-t-2 pt-4'}>
          {orderBy(balanceChanges, 'createdTime', 'desc').map((change) => {
            const { type } = change

            // BetBalanceChanges
            if (['sell_shares', 'create_bet', 'redeem_shares'].includes(type)) {
              return (
                <BetBalanceChangeRow
                  key={change.createdTime}
                  change={change as BetBalanceChange}
                />
              )
            }
            // TxnBalanceChanges
            else if (TXN_BALANCE_CHANGE_TYPES.includes(type)) {
              return (
                <TxnBalanceChangeRow
                  key={change.createdTime}
                  change={change as TxnBalanceChange}
                />
              )
            }
          })}
        </Col>
      </Col>
    </Modal>
  )
}
function ChangeIcon(props: {
  slug: string
  symbol: string | ReactNode
  className: string
}) {
  const { symbol, slug, className } = props
  return (
    <div className="relative">
      <Link href={slug} onClick={(e) => e.stopPropagation}>
        <div className={clsx('h-10 w-10 rounded-full', className)} />
        <div className="absolute bottom-1.5 left-[12px] text-lg">{symbol}</div>
      </Link>
    </div>
  )
}

const BetBalanceChangeRow = (props: { change: BetBalanceChange }) => {
  const { change } = props
  const { amount, contract, answer, bet, type } = change
  const { outcome } = bet
  const { slug, question, creatorUsername } = contract
  const niceAmount =
    ENV_CONFIG.moneyMoniker +
    shortFormatNumber(Math.round(amount)).replace('-', '')
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
  if (getMoneyNumber(amount) === 0) return null
  return (
    <Row className={'gap-2'}>
      <Col>
        <ChangeIcon
          slug={contract.slug}
          symbol={
            <div
              className={clsx(
                direction === 'sideways' ? 'mb-1.5 ml-0.5' : 'mb-1'
              )}
            >
              {direction === 'up' ? (
                <FaArrowTrendUp className={'h-5 w-5 '} />
              ) : direction === 'down' ? (
                <FaArrowTrendDown className={'h-5 w-5'} />
              ) : (
                <FaArrowRightArrowLeft className={'h-4 w-4'} />
              )}
            </div>
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
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          <Link
            href={contractPathWithoutContract(creatorUsername, slug)}
            className={clsx('line-clamp-1', linkClass)}
          >
            {question}
          </Link>
          <span className={'inline-flex whitespace-nowrap'}>
            {amount > 0 ? '+ ' : ''}
            {niceAmount}
          </span>
        </Row>
        <Row>
          <div className={clsx('text-ink-500 line-clamp-1')}>
            {type === 'redeem_shares'
              ? `Redeem shares`
              : type === 'sell_shares'
              ? `Sell ${outcome} shares`
              : `Buy ${outcome}`}
            {answer ? ` on ${answer.text}` : ''}
          </div>
        </Row>
      </Col>
    </Row>
  )
}

const TxnBalanceChangeRow = (props: { change: TxnBalanceChange }) => {
  const { change } = props
  const { contract, amount, type, user: changeUser } = change
  const reasonToBgClassNameMap: {
    [key in TxnType]: string
  } = {
    QUEST_REWARD: 'bg-amber-400',
    BETTING_STREAK_BONUS: 'bg-red-400',
    CREATE_CONTRACT_ANTE: 'bg-indigo-400',
    CONTRACT_RESOLUTION_PAYOUT: 'bg-yellow-200',
    CONTRACT_UNDO_RESOLUTION_PAYOUT: 'bg-ink-1000',
    MARKET_BOOST_REDEEM: 'bg-purple-200',
    MARKET_BOOST_CREATE: 'bg-purple-400',
    LEAGUE_PRIZE: 'bg-indigo-400',
    BOUNTY_POSTED: 'bg-indigo-400',
    BOUNTY_AWARDED: 'bg-teal-600',
    MANA_PAYMENT: 'bg-teal-400',
    LOAN: 'bg-amber-500',
    UNIQUE_BETTOR_BONUS: 'bg-sky-400',
  }
  return (
    <Row className={'gap-2'}>
      <Col>
        <ChangeIcon
          slug={contract?.slug ?? changeUser?.username ?? ''}
          symbol={
            type === 'CONTRACT_RESOLUTION_PAYOUT' ? (
              '🎉'
            ) : type === 'CREATE_CONTRACT_ANTE' || type === 'BOUNTY_POSTED' ? (
              <ScaleIcon className={'-ml-[1px] mb-1 h-5 w-5'} />
            ) : (
              '🎁'
            )
          }
          className={reasonToBgClassNameMap[type]}
        />
      </Col>
      <Col className={'w-full'}>
        <Row className={'justify-between'}>
          {contract ? (
            <Link
              href={contractPathWithoutContract(
                contract.creatorUsername,
                contract.slug
              )}
              className={clsx('line-clamp-1', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : changeUser ? (
            <Link
              href={'/' + changeUser.username}
              className={clsx('line-clamp-1', linkClass)}
            >
              {txnTitle(change)}
            </Link>
          ) : (
            <div className={clsx(' truncate')}>
              {txnTitle(change) ?? txnTypeToDescription(type)}
            </div>
          )}
          <span className={clsx('shrink-0')}>
            {amount > 0 ? '+ ' : ''}
            {formatMoney(amount).replace('-', '')}
          </span>
        </Row>
        <Row className={'text-ink-500'}>{txnTypeToDescription(type)}</Row>
      </Col>
    </Row>
  )
}

const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, questType } = change

  if (change.user) {
    return <span>{change.user.username}</span>
  }
  switch (type) {
    case 'QUEST_REWARD':
      return <span>{questType ? questTypeToDescription(questType) : ''}</span>
    case 'BETTING_STREAK_BONUS':
      return !contract ? (
        <span>Prediction streak bonus</span>
      ) : (
        <span>{contract?.question}</span>
      )
    case 'LOAN':
      return <span>Loan</span>
    case 'MARKET_BOOST_REDEEM':
      return <span>Ad claim</span>
    default:
      return <span>{contract?.question}</span>
  }
}
const questTypeToDescription = (questType: QuestType) => {
  switch (questType) {
    case 'BETTING_STREAK':
      return <span>Prediction streak</span>
    case 'SHARES':
      return <span>Question share</span>
    case 'MARKETS_CREATED':
      return <span>Question creation</span>
    case 'REFERRALS':
      return <span>Referral</span>
    default:
      return <span>{questType}</span>
  }
}

const txnTypeToDescription = (txnCategory: TxnType) => {
  switch (txnCategory) {
    case 'CONTRACT_RESOLUTION_PAYOUT':
      return <span>Payout</span>
    case 'CREATE_CONTRACT_ANTE':
      return <span>Ante</span>
    case 'UNIQUE_BETTOR_BONUS':
      return <span>Trader bonus</span>
    case 'BETTING_STREAK_BONUS':
      return <span>Quest</span>
    case 'SIGNUP_BONUS':
      return <span>Signup</span>
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return <span>Unresolve</span>
    case 'MARKET_BOOST_REDEEM':
      return <span></span>
    case 'MARKET_BOOST_CREATE':
      return <span>Ad create</span>
    case 'QUEST_REWARD':
      return <span>Quest</span>
    case 'LEAGUE_PRIZE':
      return <span>Leagues</span>
    case 'BOUNTY_POSTED':
      return <span>Ante</span>
    case 'BOUNTY_AWARDED':
      return <span>Bounty awarded</span>
    case 'MANA_PAYMENT':
      return <span>User payment</span>
    case 'LOAN':
      return <span></span>
    default:
      return <span>{txnCategory}</span>
  }
}
