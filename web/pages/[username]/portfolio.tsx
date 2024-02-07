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
import { TbArrowsExchange2 } from 'react-icons/tb'
import { MdOutlineSell } from 'react-icons/md'
import { Tooltip } from 'web/components/widgets/tooltip'
import { QuestType } from 'common/quest'
import { ENV_CONFIG } from 'common/envs/constants'
import clsx from 'clsx'
import { SEO } from 'web/components/SEO'
import Head from 'next/head'
import { Row } from 'web/components/layout/row'
import { BackButton } from 'web/components/contract/back-button'
import { UserLink } from 'web/components/widgets/user-link'
import { Page } from 'web/components/layout/page'
import Custom404 from 'web/pages/404'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { Avatar } from 'web/components/widgets/avatar'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { useState } from 'react'
import { ArrowRightIcon, ArrowUpIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { AddFundsModal } from 'web/components/add-funds-modal'

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
  const isMobile = useIsMobile()
  const [showBalanceChanges, setShowBalanceChanges] = useState(false)
  const [showAddFunds, setShowAddFunds] = useState(false)
  const { ref: titleRef, headerStuck } = useHeaderIsStuck()
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
        {isMobile && (
          <Row
            className={
              'bg-canvas-50 sticky top-0 z-10 w-full items-center justify-between gap-1 py-2 pl-4 pr-5 sm:gap-2'
            }
            ref={titleRef}
          >
            <BackButton />
            {headerStuck && (
              <span className={'text-primary-700 text-xl'}>
                {formatMoney(user.balance)}
              </span>
            )}
            <div
              className={clsx(
                'opacity-0 transition-opacity',
                headerStuck && 'opacity-100'
              )}
            >
              <UserLink user={user} noLink />
            </div>
            <Avatar
              username={user.username}
              avatarUrl={user.avatarUrl}
              size={'md'}
              className="bg-ink-1000"
              noLink
            />
          </Row>
        )}

        <Row
          className={'bg-canvas-0 mx-4 max-w-sm justify-between rounded-md p-2'}
        >
          <Col>
            <span className={'ml-1'}>Mana balance</span>
            <span className={'mb-1 text-5xl'}>{formatMoney(user.balance)}</span>
            <button
              color={'gray-white'}
              onClick={() => setShowBalanceChanges(true)}
            >
              <Row
                className={clsx(
                  changeToday > 0 ? 'text-teal-600' : 'text-ink-600',
                  'items-center'
                )}
              >
                {changeToday > 0 ? (
                  <ArrowUpIcon className={'h-4 w-4'} />
                ) : (
                  <ArrowUpIcon className={'h-4 w-4 rotate-180 transform'} />
                )}
                {formatMoney(changeToday)} today
              </Row>
            </button>
          </Col>
          <Col className={'items-end justify-between'}>
            <Link className={'text-ink-400 text-sm'} href={'/' + user.username}>
              <Row className={'items-center gap-1'}>
                See profile
                <ArrowRightIcon className={'h-4 w-4'} />
              </Row>
            </Link>
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
        {showBalanceChanges && (
          <BalanceChangesModal
            balanceChanges={balanceChanges}
            setOpen={() => setShowBalanceChanges(false)}
          />
        )}
      </Col>
    </Page>
  )
}

const BalanceChangesModal = (props: {
  balanceChanges: AnyBalanceChangeType[]
  setOpen: () => void
}) => {
  const { balanceChanges, setOpen } = props
  const changeToday = sumBy(
    balanceChanges.filter((change) => change.createdTime > Date.now() - DAY_MS),
    'amount'
  )
  const col1 = 'col-span-3'
  const col2 = 'col-span-4'
  const col3 = 'col-span-9'
  const mainCol = 'grid-cols-16 w-full grid'
  return (
    <Modal open={true} setOpen={setOpen} className={MODAL_CLASS}>
      <Col className={'w-full justify-center'}>
        <Row
          className={clsx(
            changeToday > 0 ? 'text-teal-600' : 'text-ink-600',
            'mb-2 items-center justify-center text-2xl'
          )}
        >
          {changeToday > 0 ? (
            <ArrowUpIcon className={'h-4 w-4'} />
          ) : (
            <ArrowUpIcon className={'h-4 w-4 rotate-180 transform'} />
          )}
          {formatMoney(changeToday)} today
        </Row>
        <div className={mainCol}>
          <span className={clsx(col1, 'text-ink-400 text-sm')}>Amount</span>
          <span className={clsx(col2, 'text-ink-400 text-sm')}>Type</span>
          <span className={clsx(col3, 'text-ink-400 text-sm')}>Title</span>
        </div>

        {orderBy(balanceChanges, 'createdTime', 'desc').map((change) => {
          const { type } = change

          // BetBalanceChanges
          if (['sell_shares', 'create_bet', 'redeem_shares'].includes(type)) {
            const { amount, contract, answer, bet, type } =
              change as BetBalanceChange
            const { outcome } = bet
            const { slug, question } = contract
            const niceAmount =
              ENV_CONFIG.moneyMoniker + shortFormatNumber(Math.round(amount))
            if (getMoneyNumber(amount) === 0) return null
            return (
              <div key={change.createdTime} className={mainCol}>
                <div
                  className={clsx(
                    col1,
                    ' inline-flex',
                    amount > 0 ? 'text-teal-600' : 'text-ink-600'
                  )}
                >
                  {niceAmount}
                  {type === 'redeem_shares' ? (
                    <Tooltip text={'Redemption'} className={'my-auto '}>
                      <TbArrowsExchange2 className={'h-4 w-4'} />
                    </Tooltip>
                  ) : type === 'sell_shares' ? (
                    <Tooltip text={'Sell'} className={'my-auto '}>
                      <MdOutlineSell className={'h-4 w-4'} />
                    </Tooltip>
                  ) : null}
                </div>
                <div className={clsx(col2, 'truncate')}>
                  {outcome}
                  {answer ? ` ${answer.text}` : ''}
                </div>
                <Link
                  href={'/market/' + slug}
                  className={clsx(col3, ' truncate', linkClass)}
                >
                  {question}
                </Link>
              </div>
            )
          }

          // TxnBalanceChanges
          else if (TXN_BALANCE_CHANGE_TYPES.includes(type)) {
            const txnChange = change as TxnBalanceChange
            const {
              contract,
              amount,
              createdTime,
              user: changeUser,
            } = txnChange

            return (
              <div key={createdTime} className={mainCol}>
                <div
                  className={clsx(
                    col1,
                    'inline-flex',
                    amount > 0 ? 'text-teal-600' : 'text-ink-600'
                  )}
                >
                  {formatMoney(amount)}
                </div>
                <div className={clsx(col2)}>
                  {txnTypeToDescription(change.type)}
                </div>

                {contract ? (
                  <Link
                    href={contract.creatorUsername + '/' + contract.slug}
                    className={clsx(col3, ' truncate', linkClass)}
                  >
                    {txnTitle(txnChange)}
                  </Link>
                ) : changeUser ? (
                  <Link
                    href={'/' + changeUser.username}
                    className={clsx(col3, ' truncate', linkClass)}
                  >
                    {txnTitle(txnChange)}
                  </Link>
                ) : (
                  <div className={clsx(col3, ' truncate')}>
                    {txnTitle(txnChange)}
                  </div>
                )}
              </div>
            )
          }
        })}
      </Col>
    </Modal>
  )
}

const txnTitle = (change: TxnBalanceChange) => {
  const { type, contract, questType } = change

  if (type === 'QUEST_REWARD' && questType) {
    return questTypeToDescription(questType)
  }
  if (change.user) {
    return change.user.username
  }
  return contract?.question ?? ''
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
      return <span>New trader</span>
    case 'BETTING_STREAK_BONUS':
      return <span>Streak</span>
    case 'SIGNUP_BONUS':
      return <span>Signup</span>
    case 'CONTRACT_UNDO_RESOLUTION_PAYOUT':
      return <span>Unresolve</span>
    case 'MARKET_BOOST_REDEEM':
      return <span>Ad claim</span>
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
      return <span>Managram</span>
    case 'LOAN':
      return <span>Loan</span>
    default:
      return <span>{txnCategory}</span>
  }
}
