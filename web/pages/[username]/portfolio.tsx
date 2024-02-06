import { getFullUserByUsername } from 'web/lib/supabase/users'
import { shouldIgnoreUserPage, User } from 'common/user'
import { db } from 'web/lib/supabase/db'
import { removeUndefinedProps } from 'common/util/object'
import { api } from 'web/lib/firebase/api'
import { AnyBalanceChangeType, BetBalanceChange } from 'common/balance-change'
import { formatMoney, getMoneyNumber } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { DAY_MS } from 'common/util/time'
import { orderBy } from 'lodash'
import { TbArrowsExchange2 } from 'react-icons/tb'
import { MdOutlineSell } from 'react-icons/md'
import { Tooltip } from 'web/components/widgets/tooltip'

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
        const { amount, contract, bet, type } = change as BetBalanceChange
        const { outcome, shares, isRedemption } = bet
        const { slug, question } = contract
        const niceAmount = formatMoney(Math.round(amount))
        if (getMoneyNumber(amount) === 0) return null
        return (
          <div
            key={amount + contract.slug}
            className={'grid-cols-16 grid w-full'}
          >
            <div className={'col-span-3 inline-flex'}>
              {amount > 0 ? '+' : ''}
              {niceAmount}
              {type === 'sell_shares' ? (
                isRedemption ? (
                  <Tooltip text={'Redemption'} className={'my-auto '}>
                    <TbArrowsExchange2 className={'h-4 w-4'} />
                  </Tooltip>
                ) : (
                  <Tooltip text={'Sell'} className={'my-auto '}>
                    <MdOutlineSell className={'h-4 w-4'} />
                  </Tooltip>
                )
              ) : null}
            </div>
            <div className={'col-span-2'}>{outcome}</div>
            <div className={'col-span-6'}>{question.slice(0, 18)}</div>
          </div>
        )
      })}
    </Col>
  )
}
