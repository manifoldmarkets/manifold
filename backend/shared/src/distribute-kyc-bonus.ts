import { SupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'

export async function distributeKycBonus(
  pg: SupabaseDirectClient,
  userId: string
) {
  return await pg.tx(async (tx) => {
    const data = await tx.oneOrNone<{
      reward_amount: number
      claimed: boolean
    }>(
      'select reward_amount, claimed from kyc_bonus_rewards where user_id = $1',
      [userId]
    )

    if (data?.claimed) {
      return
    }

    const reward = Math.max(data?.reward_amount ?? 0, MIN_KYC_REWARD)

    await runTxnFromBank(tx, {
      category: 'KYC_BONUS',
      token: 'CASH',
      amount: reward,
      fromType: 'BANK',
      toType: 'USER',
      toId: userId,
    })

    if (data) {
      await tx.none(
        'update kyc_bonus_rewards set claimed = true where user_id = $1',
        [userId]
      )
    } else {
      await tx.none(
        'insert into kyc_bonus_rewards (user_id, reward_amount, claimed) values ($1, $2, true)',
        [userId, reward]
      )
    }

    return reward
  })
}

const MIN_KYC_REWARD = 2
