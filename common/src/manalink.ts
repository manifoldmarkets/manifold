import { User } from './user'
import { last } from 'lodash'
import { BOT_USERNAMES } from 'common/envs/constants'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { DAY_MS } from 'common/util/time'
import { SupabaseClient } from 'common/supabase/utils'
import { formatMoney } from 'common/util/format'

type PorfolioHistoryItem = Awaited<
  ReturnType<typeof getPortfolioHistory>
>[number]

export async function canSendManaSupa(user: User, db: SupabaseClient) {
  const portfolioHistory = last(
    await getPortfolioHistory(user.id, Date.now() - DAY_MS, db)
  )
  return canSendMana(user, portfolioHistory)
}

export async function canSendMana(
  user: User,
  lastPortfolioHistory?: PorfolioHistoryItem
) {
  const ageThreshold = Date.now() - 14 * DAY_MS

  return (
    (user.createdTime < ageThreshold ||
      BOT_USERNAMES.includes(user.username)) &&
    (user.balance > 1000 ||
      user.profitCached.allTime > 500 ||
      (lastPortfolioHistory?.investmentValue ?? 0) > 1000 ||
      user.creatorTraders.allTime > 10)
  )
}

export const SEND_MANA_REQ = `Your account must be older than 2 weeks and have a balance or net worth greater than ${formatMoney(
  1000
)} or total profits greater than ${formatMoney(500)} to send mana.`
