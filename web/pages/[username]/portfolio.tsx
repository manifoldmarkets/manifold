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
import { DAY_MS } from 'common/util/time'
import { orderBy } from 'lodash'
import { TbArrowsExchange2 } from 'react-icons/tb'
import { MdOutlineSell } from 'react-icons/md'
import { Tooltip } from 'web/components/widgets/tooltip'
import { QuestType } from 'common/quest'
import { ENV_CONFIG } from 'common/envs/constants'
import clsx from 'clsx'

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
        after: Date.now() - DAY_MS,
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
  const { user, username, shouldIgnoreUser, balanceChanges } = props
  return (
    <Col className={'w-full'}>
      {orderBy(balanceChanges, 'createdTime', 'desc').map((change) => {
        const { type } = change
        if (['sell_shares', 'create_bet', 'redeem_shares'].includes(type)) {
          const { amount, contract, answer, bet, type } =
            change as BetBalanceChange
          const { outcome } = bet
          const { slug, question } = contract
          const niceAmount =
            ENV_CONFIG.moneyMoniker + shortFormatNumber(Math.round(amount))
          if (getMoneyNumber(amount) === 0) return null
          return (
            <div
              key={change.createdTime}
              className={'grid-cols-16 grid w-full'}
            >
              <div
                className={clsx(
                  'col-span-3 inline-flex',
                  amount > 0 ? 'text-teal-600' : 'text-red-600'
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
              <div className={'col-span-4 truncate'}>
                {outcome}
                {answer ? ` ${answer.text}` : ''}
              </div>
              <div className={'col-span-6 truncate'}>{question}</div>
            </div>
          )
        } else if (TXN_BALANCE_CHANGE_TYPES.includes(type)) {
          const txnChange = change as TxnBalanceChange
          const { contract, amount, createdTime } = txnChange
          const { slug, question } = contract

          return (
            <div key={createdTime} className={'grid-cols-16 grid w-full'}>
              <div
                className={clsx(
                  'col-span-3 inline-flex',
                  amount > 0 ? 'text-teal-600' : 'text-red-600'
                )}
              >
                {formatMoney(amount)}
              </div>
              <div className={'col-span-4'}>
                {txnTypeToDescription(change.type)}
              </div>
              <div className={'col-span-6 truncate'}>{txnTitle(txnChange)}</div>
            </div>
          )
        }
      })}
    </Col>
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
  return contract.question
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
    case 'UNIQUE_BETTOR_BONUS':
      return <span>Traders</span>
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
      return <span>Bounty posted</span>
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
