import { type Txn } from 'common/txn'
import { type Row, convertSQLtoTS, tsToMillis } from './utils'

export const convertTxn = (row: Row<'txns'>) =>
  convertSQLtoTS<'txns', Txn>(row, {
    fs_updated_time: false,
    created_time: tsToMillis as any,
  })
