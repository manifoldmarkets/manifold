import { SupabaseDirectClient } from 'shared/supabase/init'

export type LoanTrackingRow = {
  id?: number
  user_id: string
  contract_id: string
  answer_id: string | null
  loan_day_integral: number
  last_loan_update_time: number
}

export const getLoanTrackingRows = async (
  pg: SupabaseDirectClient,
  userId: string,
  contractIds: string[]
) => {
  if (contractIds.length === 0) return []
  return pg.manyOrNone<LoanTrackingRow>(
    `SELECT * FROM user_contract_loans
     WHERE user_id = $1 AND contract_id = ANY($2)`,
    [userId, contractIds]
  )
}

export const getLoanTrackingForContract = async (
  pg: SupabaseDirectClient,
  contractId: string,
  answerId?: string
) => {
  return pg.manyOrNone<LoanTrackingRow>(
    `SELECT * FROM user_contract_loans
     WHERE contract_id = $1
       AND ($2::text IS NULL OR answer_id = $2 OR answer_id IS NULL)`,
    [contractId, answerId ?? null]
  )
}

export const upsertLoanTrackingQuery = (
  rows: Omit<LoanTrackingRow, 'id'>[]
): string => {
  if (rows.length === 0) return 'SELECT 1 WHERE FALSE'

  const values = rows
    .map(
      (r) =>
        `(${pgEscape(r.user_id)}, ${pgEscape(r.contract_id)}, ${pgEscape(
          r.answer_id
        )}, ${r.loan_day_integral}, ${r.last_loan_update_time})`
    )
    .join(', ')

  return `
    INSERT INTO user_contract_loans (user_id, contract_id, answer_id, loan_day_integral, last_loan_update_time)
    VALUES ${values}
    ON CONFLICT (user_id, contract_id, COALESCE(answer_id, ''))
    DO UPDATE SET
      loan_day_integral = EXCLUDED.loan_day_integral,
      last_loan_update_time = EXCLUDED.last_loan_update_time
  `
}

const pgEscape = (value: string | null): string => {
  if (value === null) return 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}
