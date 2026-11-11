import {
  BROWSE_EXPERIMENT,
  BROWSE_EXPOSURE_EVENT,
  BROWSE_TOGGLE_EVENT,
} from 'common/browse-rollout'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as pgPromise from 'pg-promise'

/**
 * Read-only, production-only scorecard. Requires BROWSE_REPORT_DATABASE_URL
 * (use a read-only reporting replica) and BROWSE_EXPERIMENT_START (the same UTC
 * timestamp as NEXT_PUBLIC_BROWSE_EXPERIMENT_START). No default primary access. Run from backend/scripts:
 *   yarn ts-node browse-redesign-report.ts YYYY-MM-DD [YYYY-MM-DD]
 * Dates delimit FIRST exposures in UTC; the start may be the launch date,
 * even when launch is after midnight. The end is exclusive, defaulting to
 * now so the launch-day counts are available immediately. Outcomes mature
 * for seven days after each first exposure, regardless of the requested end.
 * The one-day columns mature after a day: nearly every signup and first bet
 * lands within a day of the first visit, so they can be read a week sooner.
 * The main outcome is activated_1d, a funded bet within a day of landing.
 *
 * Unit: browser, not person. Keep original assignments, including switchers.
 * A fresh browser can belong to an existing person; account login is reported
 * diagnostically, never used to remove someone after treatment. Cross-device
 * return and cleared browser storage are not fully observable in this test.
 *
 * The primary conversion population is anonymous at enrollment. Signup links
 * use initialDeviceToken matched to tokens observed for the experiment browser, so signup
 * counts don't depend on visiting Browse again after registration. Trading
 * uses funded non-API buy orders placed during the follow-up window (including
 * partially filled limit orders); it is a secondary activation proxy.
 *
 * This prints counts/rates, NOT an automatic significance or shipping verdict.
 * Choose the sample size, primary metric and harm thresholds before launch.
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

const launch = new Date(process.env.BROWSE_EXPERIMENT_START ?? '')
const connectionString = process.env.BROWSE_REPORT_DATABASE_URL
if (
  !connectionString ||
  !Number.isFinite(launch.getTime()) ||
  launch >= until
) {
  throw new Error(
    'Set BROWSE_REPORT_DATABASE_URL explicitly and BROWSE_EXPERIMENT_START before the cohort end.'
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
    // for each browser. Bound both work and lock waits on the reporting DB.
    await pg.none(
      "set local enable_nestloop = off; set local lock_timeout = '2s'"
    )
    const rows = await pg.manyOrNone(
      readFileSync(join(__dirname, 'browse-redesign-report.sql'), 'utf8'),
      [
        from!.toISOString(),
        until!.toISOString(),
        asOf.toISOString(),
        BROWSE_EXPOSURE_EVENT,
        BROWSE_TOGGLE_EVENT,
        BROWSE_EXPERIMENT,
        launch.toISOString(),
      ]
    )

    const rate = (count: number, total: number) =>
      total ? `${((100 * count) / total).toFixed(2)}%` : 'not mature'
    console.log(
      `Production ${BROWSE_EXPERIMENT}; first exposures ${start} to ${
        end ?? asOf.toISOString()
      } UTC`
    )
    console.log(
      'Seven-day and one-day outcomes are shown only for browsers that have had the full window. Return means Browse/Home return.'
    )
    console.table(
      rows.map((row) => ({
        ...row,
        activation_rate_1d: rate(row.activated_1d, row.mature_day_browsers),
        signup_rate_1d: rate(row.signups_1d, row.mature_day_browsers),
        signup_rate: rate(row.signups_7d, row.mature_browsers),
        activation_rate: rate(row.activated_7d, row.mature_browsers),
        return_rate: rate(row.returned_days_1_to_7, row.mature_browsers),
      }))
    )
    const randomized = rows.filter((row) => row.cohort === 'new-visitor')
    const total = (variant: string) =>
      randomized
        .filter((row) => row.variant === variant)
        .reduce((sum, row) => sum + row.browsers, 0)
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
    console.log(
      'Use new-visitor / signed_in_at_entry=false for signup and activation comparisons. Other cohorts describe voluntary adoption; they are not randomized controls.'
    )
  })
}

report()
  .catch((error) => {
    // Do not log connection details or credentials.
    console.error('Browse report failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => pgp.end())
