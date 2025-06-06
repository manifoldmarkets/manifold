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
  return await pg.map<PendingCashoutStatusData>(
    `
    WITH review_cashouts AS (
      SELECT
        users.id AS user_id,
        users.name,
        users.username,
        users.data->>'avatarUrl' AS avatar_url,
        txns.id AS txn_id,
        txns.amount,
        txns.created_time,
        (txns.data->'data'->>'payoutInDollars')::numeric AS payout_in_dollars,
        delete_after_reading.data AS data,
        ARRAY['Needs review']::text[] AS gidx_status,
        NULL::text AS transaction_id
      FROM delete_after_reading
      JOIN txns ON delete_after_reading.data->>'txnId' = txns.id
      JOIN users ON delete_after_reading.user_id = users.id
      WHERE category = 'CASH_OUT'
      AND ($3 IS NULL OR users.id = $3)
    ),
    processing_cashouts AS (
      SELECT
        u.id AS user_id,
        u.name,
        u.username,
        u.data->>'avatarUrl' AS avatar_url,
        t.id AS txn_id,
        t.amount,
        t.created_time,
        (t.data->'data'->>'payoutInDollars')::numeric AS payout_in_dollars,
        NULL::jsonb AS data,
        COALESCE(array_agg(g.transaction_status_message ORDER BY g.created_time DESC) FILTER (WHERE g.transaction_status_message IS NOT NULL), ARRAY['Unknown']) AS gidx_status,
        COALESCE(r.transaction_id, t.data->'data'->>'transactionId') AS transaction_id
      FROM txns t
      JOIN users u ON t.from_id = u.id
      LEFT JOIN redemption_status r ON t.id = r.txn_id 
      LEFT JOIN gidx_receipts g ON COALESCE(r.transaction_id, t.data->'data'->>'transactionId') = g.merchant_transaction_id
      WHERE t.category = 'CASH_OUT'
      AND ($3 IS NULL OR u.id = $3)
      GROUP BY u.id, t.id, t.created_time, r.transaction_id
    )
    SELECT * FROM (
      SELECT * FROM review_cashouts
      UNION ALL
      SELECT * FROM processing_cashouts
      WHERE txn_id NOT IN (SELECT txn_id FROM review_cashouts)
    ) combined_cashouts
    ORDER BY created_time DESC
    LIMIT $1 OFFSET $2
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
        transactionId: (row.transaction_id ?? undefined) as string | undefined,
        gidxStatus: row.gidx_status[0] as string,
      },
      data: (row.data ?? undefined) as TemporaryPaymentData | undefined,
    })
  )
}
