import { ModReport } from 'common/mod-report'
import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { removeUndefinedProps } from 'common/util/object'
import { isAdminId, isModId } from 'common/envs/constants'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { log } from 'shared/utils'
import { AdminRewardTxn } from 'common/txn'

export const updateModReport: APIHandler<'update-mod-report'> = async (
  props,
  auth
) => {
  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    throw new APIError(403, 'You are not authorized to update mod reports')
  }
  const { reportId, updates } = props
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  const updateData = removeUndefinedProps(updates)

  const { data, error } = await db
    .from('mod_reports')
    .update(updateData)
    .eq('report_id', reportId)
    .select()

  if (error) {
    log.error('Error updating report:', error)
    throw new APIError(500, 'Error updating report', { error })
  }
  if (!data || data.length === 0) {
    log.error('Report not found for ID:', { reportId })
    throw new APIError(404, 'Report not found')
  }

  if (updates.status === 'resolved' || updates.status === 'under review') {
    const existingReward = await pg.oneOrNone(
      `select 1 from txns where
     category = $1 and
     to_id = $2 and 
     from_id = 'BANK' and
     (data->'data'->'reportId')::int = $3 and 
     data->'data'->>'updateType' = $4`,
      ['ADMIN_REWARD', auth.uid, reportId, updates.status]
    )
    if (!existingReward) {
      const MOD_REWARD_AMOUNT = updates.status === 'under review' ? 10 : 15
      const txn = {
        fromId: 'BANK',
        fromType: 'BANK',
        toId: auth.uid,
        toType: 'USER',
        amount: MOD_REWARD_AMOUNT,
        token: 'M$',
        category: 'ADMIN_REWARD',
        data: {
          reportId,
          updateType: updates.status ?? '',
        },
        description: `Reward for updating mod report ${reportId}`,
      } as AdminRewardTxn
      await pg.tx(async (tx) => runTxnOutsideBetQueue(tx, txn))
    }
  }

  return { status: 'success', report: data[0] as ModReport }
}
