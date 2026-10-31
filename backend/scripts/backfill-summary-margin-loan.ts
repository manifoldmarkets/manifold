import { chunk, sumBy } from 'lodash'
import { runScript } from './run-script'
import { log } from 'shared/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'

// Resets each multiple-choice summary metric row (answer_id null) to the sum
// of its answer rows' loan and margin_loan, columns and data mirrors both.
// Until migration 2026110101 the live update_null_answer_metrics trigger
// rolled up loan but not margin_loan, so summary margin_loan only moved by the
// deltas the bet path applies, never by loan requests or repayments.
//
// Run migration 2026110101 first: from then on the trigger keeps a summary
// right whenever one of its answer rows is written, and this script fixes the
// positions nobody has touched since.
//
//   yarn ts-node backend/scripts/backfill-summary-margin-loan.ts           # dry run
//   yarn ts-node backend/scripts/backfill-summary-margin-loan.ts --apply
//
// Idempotent: a rerun only writes rows that still differ, so the dry run after
// --apply should report 0.
//
// Only positions with a nonzero margin_loan on some row are candidates. If
// neither the summary nor any answer has one, the summary's margin_loan is
// already right, and on 2026-11-01 no summary loan differed from its answers'
// sum across all 413k multiple-choice positions with a loan.

const BATCH_SIZE = 500
const MAX_ATTEMPTS = 5
// Below this a difference is float noise from the bet path, not drift worth
// reporting; the script still rewrites it.
const REPORT_EPSILON = 0.005

type Position = { user_id: string; contract_id: string }

type SummaryRow = Position & {
  loan: number
  margin_loan: number
  answer_loan: number
  answer_margin_loan: number
  data_in_sync: boolean
}

// Each summary with its answer rows' sums, for the given positions.
const summariesWithAnswerSums = `
  with positions as (
    select * from unnest($1::text[], $2::text[]) as p(user_id, contract_id)
  ),
  answer_sums as (
    select ucm.user_id, ucm.contract_id,
      coalesce(sum(ucm.loan), 0) as answer_loan,
      coalesce(sum(ucm.margin_loan), 0) as answer_margin_loan
    from user_contract_metrics ucm
    join positions p using (user_id, contract_id)
    where ucm.answer_id is not null
    group by ucm.user_id, ucm.contract_id
  )
  select s.user_id, s.contract_id,
    s.loan::float8 as loan,
    s.margin_loan::float8 as margin_loan,
    a.answer_loan::float8 as answer_loan,
    a.answer_margin_loan::float8 as answer_margin_loan,
    (s.loan = a.answer_loan
      and s.margin_loan = a.answer_margin_loan
      and (s.data->>'loan')::numeric is not distinct from a.answer_loan
      and (s.data->>'marginLoan')::numeric is not distinct from a.answer_margin_loan
    ) as data_in_sync
  from user_contract_metrics s
  join answer_sums a using (user_id, contract_id)
  where s.answer_id is null
  order by s.id`

const loadSummaries = (pg: SupabaseDirectClient, positions: Position[]) =>
  pg.manyOrNone<SummaryRow>(summariesWithAnswerSums, [
    positions.map((p) => p.user_id),
    positions.map((p) => p.contract_id),
  ])

const report = (rows: SummaryRow[]) => {
  const drifted = rows.filter(
    (r) => Math.abs(r.margin_loan - r.answer_margin_loan) > REPORT_EPSILON
  )
  return {
    summaries: rows.length,
    toWrite: rows.filter((r) => !r.data_in_sync).length,
    marginLoanOff: drifted.length,
    loanOff: rows.filter(
      (r) => Math.abs(r.loan - r.answer_loan) > REPORT_EPSILON
    ).length,
    users: new Set(drifted.map((r) => r.user_id)).size,
    contracts: new Set(drifted.map((r) => r.contract_id)).size,
    negativeSummaries: drifted.filter((r) => r.margin_loan < 0).length,
    understatedBy: sumBy(drifted, (r) => r.answer_margin_loan - r.margin_loan),
    absError: sumBy(drifted, (r) =>
      Math.abs(r.answer_margin_loan - r.margin_loan)
    ),
  }
}

// One batch in its own read-committed transaction. The summary rows are
// locked before the answer rows are summed: a concurrent answer write's
// trigger then either committed before the sum (and is included) or waits on
// the lock and writes its own, fresher sum after ours. Summing first and
// updating after could overwrite that fresher sum with a stale one.
// lock_timeout keeps a batch stuck behind a long transaction from holding the
// rest of its rows, and the bets on them, while it waits; it retries instead.
const fixBatch = async (pg: SupabaseDirectClient, positions: Position[]) =>
  pg.tx(async (tx) => {
    await tx.none(`set local lock_timeout = '5s'`)
    await tx.none(
      `select s.id from user_contract_metrics s
       join unnest($1::text[], $2::text[]) as p(user_id, contract_id)
         using (user_id, contract_id)
       where s.answer_id is null
       order by s.id
       for update of s`,
      [positions.map((p) => p.user_id), positions.map((p) => p.contract_id)]
    )
    const stale = (await loadSummaries(tx, positions)).filter(
      (r) => !r.data_in_sync
    )
    if (stale.length === 0) return 0
    await tx.none(
      `with positions as (
         select * from unnest($1::text[], $2::text[]) as p(user_id, contract_id)
       ),
       answer_sums as (
         select ucm.user_id, ucm.contract_id,
           coalesce(sum(ucm.loan), 0) as answer_loan,
           coalesce(sum(ucm.margin_loan), 0) as answer_margin_loan
         from user_contract_metrics ucm
         join positions p using (user_id, contract_id)
         where ucm.answer_id is not null
         group by ucm.user_id, ucm.contract_id
       )
       update user_contract_metrics s
       set loan = a.answer_loan,
           margin_loan = a.answer_margin_loan,
           data = s.data || jsonb_build_object(
             'loan', a.answer_loan,
             'marginLoan', a.answer_margin_loan
           )
       from answer_sums a
       where s.answer_id is null
         and s.user_id = a.user_id
         and s.contract_id = a.contract_id`,
      [stale.map((r) => r.user_id), stale.map((r) => r.contract_id)]
    )
    return stale.length
  })

// serialization failure, deadlock, lock_timeout
const isRetryable = (e: unknown) =>
  ['40001', '40P01', '55P03'].includes((e as { code?: string })?.code ?? '')

if (require.main === module)
  runScript(async ({ pg }) => {
    const apply = process.argv.includes('--apply')

    log('Finding positions with a margin loan on any metric row...')
    const positions = await pg.manyOrNone<Position>(
      `select distinct user_id, contract_id from user_contract_metrics
       where margin_loan <> 0
       order by user_id, contract_id`
    )
    log(`${positions.length} positions (binary ones have no answer rows)`)

    const batches = chunk(positions, BATCH_SIZE)
    const before: SummaryRow[] = []
    for (const batch of batches)
      before.push(...(await loadSummaries(pg, batch)))
    log('Before:', report(before))
    const worst = [...before]
      .sort(
        (a, b) =>
          Math.abs(b.answer_margin_loan - b.margin_loan) -
          Math.abs(a.answer_margin_loan - a.margin_loan)
      )
      .slice(0, 10)
      .map((r) => ({
        userId: r.user_id,
        contractId: r.contract_id,
        summaryMarginLoan: r.margin_loan,
        answerMarginLoan: r.answer_margin_loan,
      }))
    log('Largest differences:', worst)

    if (!apply) {
      log('Dry run. Pass --apply to write.')
      return
    }

    let written = 0
    for (const [i, batch] of batches.entries()) {
      for (let attempt = 1; ; attempt++) {
        try {
          written += await fixBatch(pg, batch)
          break
        } catch (e) {
          if (!isRetryable(e) || attempt >= MAX_ATTEMPTS) throw e
          log(`Batch ${i + 1} conflicted (attempt ${attempt}), retrying`)
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
        }
      }
      if ((i + 1) % 5 === 0 || i === batches.length - 1)
        log(`Batch ${i + 1}/${batches.length}: ${written} summaries written`)
    }

    const after: SummaryRow[] = []
    for (const batch of batches) after.push(...(await loadSummaries(pg, batch)))
    log('After:', report(after))
  })
