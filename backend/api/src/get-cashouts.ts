import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { CashoutStatusData } from 'common/gidx/gidx'

export const getCashouts: APIHandler<'get-cashouts'> = async (props) => {
  const { limit, offset, userId } = props

  const pg = createSupabaseDirectClient()

  return await pg.map<CashoutStatusData>(
    `
    select
        u.id as user_id, u.name, u.username, u.data->>'avatarUrl' as avatar_url,
        t.id as txn_id, t.amount, t.created_time, t.data->'data' as txn_data,
        array_agg(g.transaction_status_message order by g.created_time desc) as gidx_status
    from txns t
    join users u on t.from_id = u.id
    left join gidx_receipts g on t.data->'data'->>'transactionId' = g.merchant_transaction_id
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
        data: row.txn_data as CashoutStatusData['txn']['data'],
        gidxStatus: (row.gidx_status ?? []).filter(Boolean) as string[],
      },
    })
  )
}
