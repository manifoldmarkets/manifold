import { runScript } from 'run-script'
import { LEGACY_PRE_KYC_STARTING_BALANCE } from 'common/economy'
import { insertTxns, TxnData } from 'shared/txn/run-txn'

const dryRun = process.argv.includes('--dry-run')
const LOOKBACK_HOURS = 48
const DETECTION_WINDOW = 5
const REQUIRED_FIFTY_USERS = 4

type RecentUser = {
  id: string
  created_time: string
  balance: number
  total_deposits: number
  has_pre_kyc_bonus: boolean
  has_bets: boolean
}

runScript(async ({ pg }) => {
  const recentUsers = await pg.manyOrNone<RecentUser>(
    `select
        u.id,
        u.created_time::text,
        u.balance::float8 as balance,
        u.total_deposits::float8 as total_deposits,
        exists(
          select 1
          from txns t
          where t.to_id = u.id and t.category = 'PRE_KYC_BONUS'
        ) as has_pre_kyc_bonus,
        exists(
          select 1
          from contract_bets b
          where b.user_id = u.id
        ) as has_bets
     from users u
     where u.created_time >= now() - interval '${LOOKBACK_HOURS} hours'
     order by u.created_time asc`
  )

  const inactiveUsers = recentUsers.filter((u) => !u.has_bets)
  const looksLikeZeroStart = (u: RecentUser) =>
    !u.has_pre_kyc_bonus && u.balance === 0 && u.total_deposits === 0
  const looksLikeFiftyStart = (u: RecentUser) =>
    u.has_pre_kyc_bonus ||
    (u.balance === LEGACY_PRE_KYC_STARTING_BALANCE &&
      u.total_deposits === LEGACY_PRE_KYC_STARTING_BALANCE)

  const switchoverIndex = inactiveUsers.findIndex((user, i) => {
    if (!looksLikeFiftyStart(user)) return false
    const postWindow = inactiveUsers.slice(i, i + DETECTION_WINDOW)
    if (postWindow.length < DETECTION_WINDOW) return false
    const fiftyCount = postWindow.filter(looksLikeFiftyStart).length
    if (fiftyCount < REQUIRED_FIFTY_USERS) return false

    const previousWindow = inactiveUsers.slice(
      Math.max(0, i - DETECTION_WINDOW),
      i
    )
    if (previousWindow.length === 0) return true

    const zeroCount = previousWindow.filter(looksLikeZeroStart).length
    return zeroCount >= Math.min(previousWindow.length, REQUIRED_FIFTY_USERS - 1)
  })

  if (switchoverIndex === -1) {
    console.error(
      `Could not detect 0 -> ${LEGACY_PRE_KYC_STARTING_BALANCE} switchover in the last ${LOOKBACK_HOURS} hours.`
    )
    process.exit(1)
  }

  const switchoverTime = inactiveUsers[switchoverIndex].created_time
  const firstTrackedBonusUser = recentUsers.find(
    (u) => u.created_time > switchoverTime && u.has_pre_kyc_bonus
  )
  const backfillEndTime = firstTrackedBonusUser?.created_time

  const usersToBackfill = recentUsers.filter((u) => {
    if (u.created_time < switchoverTime) return false
    if (backfillEndTime && u.created_time >= backfillEndTime) return false
    return !u.has_pre_kyc_bonus
  })

  console.log(
    `Detected switchover at ${switchoverTime}; backfilling ${usersToBackfill.length} users` +
      (backfillEndTime ? ` until ${backfillEndTime}` : ' through now')
  )
  if (usersToBackfill.length === 0) return

  const txns: TxnData[] = usersToBackfill.map((u) => ({
    fromId: 'BANK',
    fromType: 'BANK' as const,
    toId: u.id,
    toType: 'USER' as const,
    amount: LEGACY_PRE_KYC_STARTING_BALANCE,
    token: 'M$' as const,
    category: 'PRE_KYC_BONUS' as const,
    description: 'Pre-KYC starting balance (backfill)',
  }))

  if (dryRun) {
    console.log('Dry run only. No txns inserted.')
    console.log(usersToBackfill.map((u) => u.id))
    return
  }

  await pg.tx(async (tx) => {
    await insertTxns(tx, txns)
  })

  console.log(`Inserted ${txns.length} PRE_KYC_BONUS txns`)
})
