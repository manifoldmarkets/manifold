import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import {
  PendingCashoutStatusData,
  TemporaryPaymentData,
} from 'common/gidx/gidx'
import { isAdminId } from 'common/envs/constants'

export const getCashouts: APIHandler<'get-cashouts'> = async (props, auth) => {
  const { limit, offset, userId } = props
  if (!isAdminId(auth.uid) && userId !== auth.uid) {
    throw new APIError(403, 'Only admins can view all cashout requests')
  }
  const pg = createSupabaseDirectClient()

  const toReviewCashouts = await pg.map<PendingCashoutStatusData>(
    `
    select
    user_id,
    users.name,
    users.username,
    users.data->>'avatarUrl' as avatar_url,
    txns.id as txn_id,
    txns.amount,
    txns.created_time,
    (txns.data->'data'->>'payoutInDollars')::numeric as payout_in_dollars,
    delete_after_reading.data as data
    from delete_after_reading
    JOIN txns ON delete_after_reading.data->>'txnId' = txns.id
    join users on delete_after_reading.user_id = users.id
    and category ='CASH_OUT'
    and ($3 is null or users.id = $3)
    order by txns.created_time desc
    limit $1 offset $2
    `,
    [limit, offset, userId ?? null],
    (row) => ({
      user: {
        id: row.user_id as string,
        name: row.name as string,
        username: row.username as string,
        avatarUrl: row.avatar_url as string,
      },
      txn: {
        id: row.txn_id as string,
        amount: row.amount as number,
        createdTime: row.created_time as string,
        payoutInDollars: row.payout_in_dollars as number,
        transactionId: undefined,
        gidxStatus: 'Needs review',
      },
      data: row.data as TemporaryPaymentData,
    })
  )
  const processedCashouts = await pg.map<PendingCashoutStatusData>(
    `
    select
        u.id as user_id, u.name, u.username, u.data->>'avatarUrl' as avatar_url,
        t.id as txn_id, t.amount, t.created_time, t.data->'data' as txn_data,
        array_agg(g.transaction_status_message order by g.created_time desc) as gidx_status
    from txns t
    join users u on t.from_id = u.id
    left join redemption_status r on t.id = r.txn_id 
    left join gidx_receipts g on coalesce(r.transaction_id, t.data->'data'->>'transactionId') = g.merchant_transaction_id
    where t.category = 'CASH_OUT'
    and ($3 is null or u.id = $3)
    group by u.id, t.id, t.created_time
    order by t.created_time desc
    limit $1 offset $2
    `,
    [limit, offset, userId ?? null],
    (row) => ({
      user: {
        id: row.user_id as string,
        name: row.name as string,
        username: row.username as string,
        avatarUrl: row.avatar_url as string,
      },
      txn: {
        id: row.txn_id as string,
        amount: row.amount as number,
        createdTime: row.created_time as string,
        payoutInDollars: row.txn_data.payoutInDollars as number,
        transactionId: row.txn_data.transactionId as string,
        gidxStatus: ((row.gidx_status ?? []).filter(Boolean)[0] ??
          'Unknown') as string,
      },
      data: undefined,
    })
  )
  return [
    ...toReviewCashouts,
    ...processedCashouts.filter(
      (c) => !toReviewCashouts.some((trc) => trc.txn.id === c.txn.id)
    ),
  ]
}
