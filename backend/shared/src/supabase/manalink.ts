import { User } from 'common/user'
import { last } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { SupabaseDirectClient } from './init'
import { canSendMana } from 'common/manalink'
import { getPortfolioHistoryDirect } from './portfolio-metrics'

// copied from common/manalink
export async function canSendManaDirect(user: User, db: SupabaseDirectClient) {
  const portfolioHistory = last(
    await getPortfolioHistoryDirect(user.id, Date.now() - DAY_MS, db)
  )
  return canSendMana(user, portfolioHistory)
}
