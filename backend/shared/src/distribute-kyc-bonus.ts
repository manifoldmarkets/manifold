import { SupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { KYC_VERIFICATION_BONUS_CASH } from 'common/economy'
import { User } from 'common/user'

export async function distributeKycBonus(pg: SupabaseDirectClient, user: User) {
  const userId = user.id
  await pg.tx(async (tx) => {
    const data = await tx.oneOrNone<{
      claimed: boolean
    }>('select claimed from kyc_bonus_rewards where user_id = $1', [userId])

    if (data?.claimed) {
      return
    }

    const reward = KYC_VERIFICATION_BONUS_CASH

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
        'update kyc_bonus_rewards set claimed = true, claim_time = now() where user_id = $1',
        [userId]
      )
    } else {
      await tx.none(
        'insert into kyc_bonus_rewards (user_id, reward_amount, claimed, claim_time) values ($1, $2, true, now())',
        [userId, reward]
      )
    }
  })
}
