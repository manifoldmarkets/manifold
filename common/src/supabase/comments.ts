import { ContractComment } from 'common/comment'
import { convertSQLtoTS, Row, tsToMillis } from './utils'

export const convertContractComment = (row: Row<'contract_comments'>) =>
  convertSQLtoTS<'contract_comments', ContractComment>(row, {
    created_time: tsToMillis as any,
  })
