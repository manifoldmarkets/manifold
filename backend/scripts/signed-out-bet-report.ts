import {
  SIGNED_OUT_BET_SIGN_IN_EVENT,
  SIGNED_OUT_BET_TEST,
} from 'common/signed-out-bet'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as pgPromise from 'pg-promise'

/**
 * Read-only, production-only scorecard for the signed-out bet sign-in test
 * (common/src/signed-out-bet.ts). Requires SIGNED_OUT_BET_REPORT_DATABASE_URL
 * (use a read-only reporting replica) and SIGNED_OUT_BET_EXPERIMENT_START (the
 * UTC time the test went live). No default primary access. Run from
 * backend/scripts:
 *   yarn ts-node signed-out-bet-report.ts YYYY-MM-DD [YYYY-MM-DD]
 * Dates delimit FIRST exposures in UTC. The end is exclusive and defaults to
 * now.
 *
 * Unit: device token, which is what signup records. A device enters at its
 * first signed-out bet press. QA-forced devices and preview/local presses are
 * left out.
 *
 * Signup counts any new account created on the device within one hour of that
 * first press, whichever button made it. Activation is a funded non-API buy
 * by that account within 24 hours of the first press. Each is shown only for
 * devices old enough to have had the full window.
 *
 * first_surface 'ticket' is a market page, where the variants differ in
 * whether sign-in opens on the press. 'button' is a list row or card, where
 * they differ only in whether the bet reopens after sign-in.
 *
 * This prints counts and rates, NOT a significance or shipping verdict.
 */
const [start, end] = process.argv.slice(2)
const asOf = new Date()
const parseDate = (value: string | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : undefined
}
const from = parseDate(start)
const until = end ? parseDate(end) : asOf
if (
  !from ||
  !until ||
  until <= from ||
  until > asOf ||
  until.getTime() - from.getTime() > 90 * 86400000
) {
  throw new Error(
    'Use two UTC dates, increasing, no later than today, at most 90 days apart.'
  )
}

const launch = new Date(process.env.SIGNED_OUT_BET_EXPERIMENT_START ?? '')
const connectionString = process.env.SIGNED_OUT_BET_REPORT_DATABASE_URL
if (
  !connectionString ||
  !Number.isFinite(launch.getTime()) ||
  launch >= until
) {
  throw new Error(
    'Set SIGNED_OUT_BET_REPORT_DATABASE_URL explicitly and SIGNED_OUT_BET_EXPERIMENT_START before the cohort end.'
  )
}
const pgp = pgPromise()
const database = pgp({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  query_timeout: 35000,
})
const mode = new pgp.txMode.TransactionMode({
  tiLevel: pgp.txMode.isolationLevel.repeatableRead,
  readOnly: true,
})

async function report() {
  await database.tx({ mode }, async (pg) => {
    // CTE event sets have no indexes. Hash/merge joins avoid a nested rescan
    // for each device. Bound both work and lock waits on the reporting DB.
    await pg.none(
      "set local enable_nestloop = off; set local lock_timeout = '2s'"
    )
    const rows = await pg.manyOrNone(
      readFileSync(join(__dirname, 'signed-out-bet-report.sql'), 'utf8'),
      [
        from!.toISOString(),
        until!.toISOString(),
        asOf.toISOString(),
        SIGNED_OUT_BET_TEST,
        SIGNED_OUT_BET_SIGN_IN_EVENT,
        launch.toISOString(),
      ]
    )

    const rate = (count: number, total: number) =>
      total ? `${((100 * count) / total).toFixed(2)}%` : 'not mature'
    console.log(
      `Production ${SIGNED_OUT_BET_TEST}; first presses ${start} to ${
        end ?? asOf.toISOString()
      } UTC`
    )
    console.table(
      rows.map((row) => ({
        ...row,
        signup_rate_1h: rate(row.signups_1h, row.mature_hour_devices),
        activation_rate_1d: rate(row.activated_1d, row.mature_day_devices),
      }))
    )
    const total = (variant: string) =>
      rows
        .filter((row) => row.variant === variant)
        .reduce((sum, row) => sum + row.devices, 0)
    const control = total('control')
    const treatment = total('treatment')
    const chiSquare =
      control + treatment
        ? (control - treatment) ** 2 / (control + treatment)
        : null
    console.log({ control, treatment, sampleRatioChiSquare: chiSquare })
    console.log(
      'Investigate assignment conflicts and a 50/50 sample-ratio chi-square above 3.841 before interpreting lift. A passing check does not prove the experiment valid.'
    )
  })
}

report()
  .catch((error) => {
    // Do not log connection details or credentials.
    console.error('Signed-out bet report failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pgp.end())
