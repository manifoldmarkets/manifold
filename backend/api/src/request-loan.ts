import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import {
  calculateMaxGeneralLoanAmount,
  calculateDailyLoanLimit,
  distributeLoanProportionally,
  filterLoanEquityMetrics,
  isUserEligibleForGeneralLoan,
  isMarketEligibleForLoan,
  getMidnightPacific,
} from 'common/loans'
import { Contract } from 'common/contract'
import { MarginLoanTxn } from 'common/txn'
import { txnToRow } from 'shared/txn/run-txn'
import { sumBy } from 'lodash'
import {
  getUnresolvedContractMetricsContractsAnswers,
  getUnresolvedStatsForToken,
} from 'shared/update-user-portfolio-histories-core'
import { keyBy } from 'lodash'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { getInsertQuery } from 'shared/supabase/utils'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  accrueLoanTrackingQuery,
  incrementLoanFieldsQuery,
} from 'shared/helpers/user-contract-loans'
import {
  canAccessMarginLoans,
  getMaxLoanNetWorthPercent,
} from 'common/supporter-config'
import { type Row } from 'common/supabase/utils'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'

export const requestLoan: APIHandler<'request-loan'> = async (props, auth) => {
  const { amount, contractId, answerId: _answerId } = props
  const pg = createSupabaseDirectClient()

  // Check if loans are globally enabled
  const loanStatus = await pg.oneOrNone<{ status: boolean }>(
    `SELECT status FROM system_trading_status WHERE token = 'LOAN'`
  )
  if (loanStatus && !loanStatus.status) {
    throw new APIError(
      503,
      'Loans are currently disabled. Please try again later.'
    )
  }

  if (amount <= 0) {
    throw new APIError(400, 'Loan amount must be positive')
  }

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, `User ${auth.uid} not found`)
  }

  // Check if user has margin loan access (Pro or Premium tier required)
  const entitlements = await getActiveSupporterEntitlements(pg, auth.uid)

  if (!canAccessMarginLoans(entitlements)) {
    throw new APIError(
      403,
      'Margin loans require a Manifold membership. Upgrade at manifold.markets/shop'
    )
  }

  // Get tier-specific max loan percent
  const maxLoanPercent = getMaxLoanNetWorthPercent(entitlements)

  const portfolioMetricRow = await pg.oneOrNone<
    Row<'user_portfolio_history_latest'>
  >(
    `select *
     from user_portfolio_history_latest
     where user_id = $1`,
    [auth.uid]
  )
  const portfolioMetric = portfolioMetricRow
    ? convertPortfolioHistory(portfolioMetricRow)
    : null
  if (!portfolioMetric) {
    throw new APIError(404, `No portfolio found for user ${auth.uid}`)
  }

  // Market-specific loan - DISABLED
  if (contractId) {
    throw new APIError(
      400,
      'Per-market loans are currently disabled. Loans are automatically taken when you trade beyond your balance.'
    )
  }

  const midnightPT = getMidnightPacific()
  const { txnQuery, balanceUpdateQuery } = payUserLoan(user.id, amount)

  const { userUpdates, distributions } = await betsQueue.enqueueFn(async () => {
    return pg.tx(async (tx) => {
      // Lock the user row to serialize loan requests (and bets, which update
      // the balance before writing metrics) for this user across replicas.
      // Every loan input is read after this lock: computing from a snapshot
      // taken before it let concurrent requests each pay out while recording
      // the debt only once.
      await tx.oneOrNone('select 1 from users where id = $1 for update', [
        user.id,
      ])
      const now = Date.now()

      const distributions = await planGeneralLoan(
        tx,
        user.id,
        amount,
        maxLoanPercent,
        portfolioMetric,
        midnightPT
      )

      // Loan tracking must accrue against the old marginLoan, so it runs
      // before the increment.
      const loanTrackingQ = accrueLoanTrackingQuery(user.id, distributions, now)
      const incrementLoansQ = incrementLoanFieldsQuery(
        user.id,
        distributions.map((d) => ({
          contractId: d.contractId,
          answerId: d.answerId,
          marginLoanDelta: d.loanAmount,
        }))
      )

      const res = await tx.multi(
        `${balanceUpdateQuery};
           ${txnQuery};
           ${loanTrackingQ};
           ${incrementLoansQ}`
      )
      const userUpdates = res[0] as UserUpdate[]
      return { userUpdates, distributions }
    })
  }, [auth.uid])

  broadcastUserUpdates(userUpdates)
  log(`User ${user.id} took general loan of ${amount}`)

  return {
    success: true,
    amount,
    distributed: distributions,
  }
}

// Must be called with the user row locked: the limits and the distribution
// are only valid against loan state no other request can change.
const planGeneralLoan = async (
  tx: SupabaseTransaction,
  userId: string,
  amount: number,
  maxLoanPercent: number,
  portfolioMetric: PortfolioMetrics,
  midnightPT: Date
) => {
  // General loan - distribute proportionally across all markets
  const { contracts, metrics } =
    await getUnresolvedContractMetricsContractsAnswers(tx, [userId])
  const contractsById = keyBy(contracts, 'id')
  // Perps neither receive loans nor collateralize them — exclude from equity.
  const { value: portfolioValueNet } = getUnresolvedStatsForToken(
    'MANA',
    filterLoanEquityMetrics(metrics, contractsById),
    contractsById
  )

  // Calculate current loan from live contract metrics (not cached portfolio history)
  // to stay consistent with get-next-loan-amount which also sums from metrics.
  const currentFreeLoan = sumBy(metrics, (m) => m.loan ?? 0)
  const currentMarginLoan = sumBy(metrics, (m) => m.marginLoan ?? 0)
  const loanTotal = currentFreeLoan + currentMarginLoan

  // Calculate equity from net portfolio value (already excludes loans).
  // Using equity prevents the compounding loop where borrowing increases borrowing capacity.
  // Note: Balance is not included since loans are taken against positions.
  const equity = Math.max(0, portfolioValueNet)

  // Check total loan limit based on equity (tier-specific)
  // Override loanTotal with live value so validation matches the UI display
  if (
    !isUserEligibleForGeneralLoan(
      { ...portfolioMetric, loanTotal },
      equity,
      amount,
      maxLoanPercent
    )
  ) {
    const maxLoan = calculateMaxGeneralLoanAmount(equity, maxLoanPercent)
    const currentLoan = loanTotal
    throw new APIError(
      400,
      `Loan amount exceeds maximum. Max loan: ${maxLoan.toFixed(
        2
      )}, current loan: ${currentLoan.toFixed(2)}, available: ${(
        maxLoan - currentLoan
      ).toFixed(2)}`
    )
  }

  // Check daily loan limit based on equity (10% of equity per day, resets at midnight PT)
  const dailyLimit = calculateDailyLoanLimit(equity)
  const todayLoansResult = await tx.oneOrNone<{ total: number }>(
    `select coalesce(sum(amount), 0)::float as total
     from txns
     where to_id = $1
     and category IN ('MARGIN_LOAN', 'LOAN')
     and created_time >= $2`,
    [userId, midnightPT.toISOString()]
  )
  const todayLoans = todayLoansResult?.total ?? 0

  if (todayLoans + amount > dailyLimit) {
    const availableToday = Math.max(0, dailyLimit - todayLoans)
    throw new APIError(
      400,
      `Daily loan limit exceeded. You can borrow up to ${dailyLimit.toFixed(
        2
      )} per day (resets at midnight PT). You've already borrowed ${todayLoans.toFixed(
        2
      )} today. Available today: ${availableToday.toFixed(2)}`
    )
  }

  // Filter to only unresolved MANA markets that meet eligibility criteria
  const unresolvedManaMetrics = metrics.filter((m) => {
    const contract = contractsById[m.contractId]
    if (!contract || contract.isResolved || contract.token !== 'MANA') {
      return false
    }
    // Perps are inherently leveraged — exclude from the loans system.
    if ((contract as Contract).mechanism === 'perp') return false
    // Apply market eligibility criteria for new loans
    return isMarketEligibleForLoan({
      visibility: contract.visibility,
      isRanked: contract.isRanked,
      uniqueBettorCount: contract.uniqueBettorCount,
      createdTime: contract.createdTime,
    }).eligible
  })

  if (unresolvedManaMetrics.length === 0) {
    throw new APIError(
      400,
      'No eligible markets to distribute loan across. Markets must be listed, ranked, have >10 traders, and be at least 24 hours old.'
    )
  }

  // Distribute loan proportionally
  const distributions = distributeLoanProportionally(
    amount,
    unresolvedManaMetrics
  )

  if (distributions.length === 0) {
    throw new APIError(
      400,
      'No markets with investment to distribute loan across'
    )
  }

  return distributions
}

const payUserLoan = (userId: string, payout: number) => {
  const loanTxn: Omit<MarginLoanTxn, 'id' | 'createdTime'> = {
    fromId: 'BANK',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'MARGIN_LOAN',
    data: {
      // Distinguishes correct loans from erroneous old loans that were marked as deposits instead of profit.
      countsAsProfit: true,
    },
  }
  const balanceUpdate = {
    id: loanTxn.toId,
    balance: payout,
  }
  const balanceUpdateQuery = bulkIncrementBalancesQuery([balanceUpdate])
  const txnQuery = getInsertQuery('txns', txnToRow(loanTxn))
  return {
    txnQuery,
    balanceUpdateQuery,
  }
}
