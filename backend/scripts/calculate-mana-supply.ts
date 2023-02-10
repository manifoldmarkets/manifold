import { PortfolioMetrics, User } from 'common/user'
import { formatLargeNumber } from 'common/util/format'
import { mapAsync } from 'common/util/promise'
import { DAY_MS } from 'common/util/time'
import * as admin from 'firebase-admin'
import { CollectionReference } from 'firebase-admin/firestore'
import { sum } from 'lodash'
import { getValues, loadPaginated } from 'shared/utils'
import { initAdmin } from 'shared/init-admin'
initAdmin()

const firestore = admin.firestore()

async function calculateManaSupply() {
  const users = await loadPaginated(
    firestore.collection('users') as CollectionReference<User>,
    500
  )
  console.log(`Loaded ${users.length} users.`)

  const now = Date.now()

  const portfolioValues = await mapAsync(users, async (user) => {
    const portfolioHistory = await loadPortfolioHistory(user.id, now)
    const { current } = portfolioHistory
    if (!current) return 0
    return current.investmentValue + current.balance
  })

  const totalMana = sum(portfolioValues)
  console.log(
    'Current mana supply (incl house accounts):',
    formatLargeNumber(totalMana)
  )
}

const loadPortfolioHistory = async (userId: string, now: number) => {
  const query = firestore
    .collection('users')
    .doc(userId)
    .collection('portfolioHistory')
    .orderBy('timestamp', 'desc')
    .limit(1)

  const portfolioMetrics = await Promise.all([
    getValues<PortfolioMetrics>(query),
    getValues<PortfolioMetrics>(query.where('timestamp', '<', now - DAY_MS)),
    getValues<PortfolioMetrics>(
      query.where('timestamp', '<', now - 7 * DAY_MS)
    ),
    getValues<PortfolioMetrics>(
      query.where('timestamp', '<', now - 30 * DAY_MS)
    ),
  ])
  const [current, day, week, month] = portfolioMetrics.map(
    (p) => p[0] as PortfolioMetrics | undefined
  )

  return {
    current,
    day,
    week,
    month,
  }
}

if (require.main === module) {
  calculateManaSupply().then(() => process.exit())
}
