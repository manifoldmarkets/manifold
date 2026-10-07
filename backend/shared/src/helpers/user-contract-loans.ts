import { pgp, SupabaseDirectClient } from 'shared/supabase/init'
import { MS_PER_DAY } from 'common/loans'
import { uniqBy } from 'lodash'

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

export type LoanDelta = {
  contractId: string
  answerId?: string | null
  loanDelta?: number
  marginLoanDelta?: number
}

/**
 * Applies loan/marginLoan changes relative to the values currently stored,
 * touching only the loan columns (and their mirrors in data).
 *
 * Loan endpoints must use this rather than bulkUpdateContractMetricsQuery:
 * a full-row upsert writes back whatever snapshot the caller read, so two
 * racing loans record the debt once, and a loan racing a sell can restore
 * shares that were just sold.
 */
export const incrementLoanFieldsQuery = (
  userId: string,
  deltas: LoanDelta[]
): string => {
  // UPDATE ... FROM applies at most one source row per target, so merge
  // duplicate keys rather than silently dropping all but one.
  const merged = new Map<string, Required<LoanDelta>>()
  for (const d of deltas) {
    const key = `${d.contractId}-${d.answerId ?? ''}`
    const existing = merged.get(key) ?? {
      contractId: d.contractId,
      answerId: d.answerId ?? null,
      loanDelta: 0,
      marginLoanDelta: 0,
    }
    existing.loanDelta += d.loanDelta ?? 0
    existing.marginLoanDelta += d.marginLoanDelta ?? 0
    merged.set(key, existing)
  }
  const rows = [...merged.values()].filter(
    (d) => d.loanDelta !== 0 || d.marginLoanDelta !== 0
  )
  if (rows.length === 0) return 'SELECT 1 WHERE FALSE'

  const values = rows
    .map((d) =>
      pgp.as.format('($1::text, $2::text, $3::numeric, $4::numeric)', [
        d.contractId,
        d.answerId,
        d.loanDelta,
        d.marginLoanDelta,
      ])
    )
    .join(', ')

  // SET expressions all see the pre-update row, so the column and data
  // mirror get the same value. `values` is already formatted, so it is
  // concatenated rather than passed through a second format pass.
  return (
    `UPDATE user_contract_metrics ucm
     SET loan = greatest(0, ucm.loan + v.loan_delta),
         margin_loan = greatest(0, ucm.margin_loan + v.margin_loan_delta),
         data = ucm.data || jsonb_build_object(
           'loan', greatest(0, ucm.loan + v.loan_delta),
           'marginLoan', greatest(0, ucm.margin_loan + v.margin_loan_delta)
         )
     FROM (VALUES ${values}) AS v(contract_id, answer_id, loan_delta, margin_loan_delta)` +
    pgp.as.format(
      `
     WHERE ucm.user_id = $1
       AND ucm.contract_id = v.contract_id
       AND coalesce(ucm.answer_id, '') = coalesce(v.answer_id, '')`,
      [userId]
    )
  )
}

/**
 * Accrues loan_day_integral up to `now` using the margin loan currently
 * stored on the metric row, then stamps last_loan_update_time = now.
 * Must run before the marginLoan change it precedes, so the accrual uses the
 * old principal.
 */
export const accrueLoanTrackingQuery = (
  userId: string,
  keys: { contractId: string; answerId?: string | null }[],
  now: number
): string => {
  if (keys.length === 0) return 'SELECT 1 WHERE FALSE'
  const values = uniqBy(keys, (k) => `${k.contractId}-${k.answerId ?? ''}`)
    .map((k) =>
      pgp.as.format('($1::text, $2::text)', [k.contractId, k.answerId ?? null])
    )
    .join(', ')

  return (
    pgp.as.format(
      `INSERT INTO user_contract_loans (user_id, contract_id, answer_id, loan_day_integral, last_loan_update_time)
     SELECT $1, v.contract_id, v.answer_id, 0, $2::bigint
     FROM (VALUES `,
      [userId, now]
    ) +
    values +
    `) AS v(contract_id, answer_id)
     ON CONFLICT (user_id, contract_id, COALESCE(answer_id, ''))
     DO UPDATE SET
       loan_day_integral = user_contract_loans.loan_day_integral
         + coalesce((
             SELECT ucm.margin_loan FROM user_contract_metrics ucm
             WHERE ucm.user_id = user_contract_loans.user_id
               AND ucm.contract_id = user_contract_loans.contract_id
               AND coalesce(ucm.answer_id, '') = coalesce(user_contract_loans.answer_id, '')
           ), 0)
         * greatest(0, EXCLUDED.last_loan_update_time - user_contract_loans.last_loan_update_time)
         / ${MS_PER_DAY},
       last_loan_update_time = EXCLUDED.last_loan_update_time`
  )
}

const pgEscape = (value: string | null): string => {
  if (value === null) return 'NULL'
  return `'${value.replace(/'/g, "''")}'`
}
