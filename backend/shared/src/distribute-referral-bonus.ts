import { SupabaseTransaction } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { REFERRAL_AMOUNT, REFERRAL_AMOUNT_CASH } from 'common/economy'
import { createReferralNotification } from './create-notification'
import { User } from 'common/user'

export async function distributeReferralBonusIfNoneGiven(
  tx: SupabaseTransaction,
  user: User,
  referrerId: string,
  referrerSweepsVerified: boolean | undefined
) {
  const userId = user.id
  const previousReferralTxn = await tx.oneOrNone(
    `select 1 from txns where to_id = $1
           and category = 'REFERRAL'
           and token = 'M$'
           and data->'data'->>'referredById' = $2`,
    [userId, referrerId]
  )
  if (previousReferralTxn) {
    return
  }
  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'M$',
    amount: REFERRAL_AMOUNT,
    fromType: 'BANK',
    toType: 'USER',
    toId: userId,
    data: {
      referredById: referrerId,
    },
  })
  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'CASH',
    amount: REFERRAL_AMOUNT_CASH,
    fromType: 'BANK',
    toType: 'USER',
    toId: userId,
    data: {
      referredById: referrerId,
    },
  })

  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'M$',
    amount: REFERRAL_AMOUNT,
    fromType: 'BANK',
    toType: 'USER',
    toId: referrerId,
    data: {
      referredId: userId,
    },
  })
  if (referrerSweepsVerified) {
    await runTxnFromBank(tx, {
      category: 'REFERRAL',
      token: 'CASH',
      amount: REFERRAL_AMOUNT_CASH,
      fromType: 'BANK',
      toType: 'USER',
      toId: referrerId,
      data: {
        referredId: userId,
      },
    })
  }
  await createReferralNotification(referrerId, user, {
    manaAmount: REFERRAL_AMOUNT,
    cashAmount: referrerSweepsVerified ? REFERRAL_AMOUNT_CASH : 0,
  })
}
