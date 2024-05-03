import { type Txn } from 'common/txn'
import { type Row, tsToMillis } from './utils'

export const convertTxn = (row: Row<'txns'>): Txn => ({
  id: row.id,
  amount: row.amount,
  fromId: row.from_id,
  toId: row.to_id,
  fromType: row.from_type as any,
  toType: row.to_type as any,
  category: row.category as any,
  createdTime: tsToMillis(row.created_time),
  token: (row.data as any).token,
})
