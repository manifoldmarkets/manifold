import { ENV_CONFIG } from 'common/envs/constants'
import { MNX_CLICK_EVENT } from 'common/perps/mnx-cta'
import { READ_ONLY_REPEATABLE_MODE } from 'shared/supabase/init'
import { runScript } from './run-script'

/**
 * Read-only report on click-throughs to MNX: how many, from which placement,
 * on which instrument, and who.
 *
 * Usage:
 *   yarn ts-node count-mnx-clicks.ts [days] [top]
 *
 * Days defaults to 7 (max 90) and top (how many clickers to name) to 25.
 * Every query is bounded by `ts` because that is the only index on
 * user_events — the table is hundreds of millions of rows, and filtering on
 * `name` alone is a sequential scan that times out (the same lesson as
 * /admin/journeys).
 */

const DEFAULT_DAYS = 7
const MAX_DAYS = 90
const DEFAULT_TOP = 25

const [daysArg, topArg] = process.argv.slice(2)
const days = daysArg === undefined ? DEFAULT_DAYS : Number(daysArg)
const top = topArg === undefined ? DEFAULT_TOP : Number(topArg)

if (
  !Number.isInteger(days) ||
  days < 1 ||
  days > MAX_DAYS ||
  !Number.isInteger(top) ||
  top < 1
) {
  console.error(
    `Usage: yarn ts-node count-mnx-clicks.ts [days 1-${MAX_DAYS}] [top]`
  )
  process.exit(1)
}

// One window, one event name, shared by every query below.
const withMnxClicks = `
  with mnx_clicks as (
    select
      user_id,
      contract_id,
      data->>'location' as location,
      data->>'symbol' as symbol,
      data->>'deviceId' as device_id
    from user_events
    where name = $1
      and ts >= now() - make_interval(days => $2::int)
  )
`

type Totals = {
  clicks: number
  signed_in_users: number
  anonymous_devices: number
  markets: number
}
type Breakdown = { label: string; clicks: number; users: number }
type Clicker = { username: string; name: string; clicks: number }

const pad = (value: string | number, width: number) =>
  String(value).padStart(width)

const printBreakdown = (title: string, rows: Breakdown[]) => {
  console.log(`\n=== ${title} ===`)
  if (!rows.length) return console.log('(none)')
  const width = Math.max(...rows.map((r) => r.label.length))
  for (const row of rows)
    console.log(
      `${row.label.padEnd(width)}  ${pad(row.clicks, 6)} clicks  ${pad(
        row.users,
        5
      )} signed-in`
    )
}

runScript(async ({ pg: database }) => {
  await database.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (pg) => {
    // Fail closed rather than leave a heavy scan running against the primary.
    await pg.none("set local statement_timeout = '120s'")
    const params = [MNX_CLICK_EVENT, days]

    const totals = await pg.one<Totals>(
      `${withMnxClicks}
       select
         count(*)::int as clicks,
         count(distinct user_id)::int as signed_in_users,
         (count(distinct device_id) filter (where user_id is null))::int
           as anonymous_devices,
         count(distinct contract_id)::int as markets
       from mnx_clicks`,
      params
    )

    const byLocation = await pg.map<Breakdown>(
      `${withMnxClicks}
       select
         coalesce(location, '(unrecorded)') as label,
         count(*)::int as clicks,
         count(distinct user_id)::int as users
       from mnx_clicks
       group by 1
       order by clicks desc, label`,
      params,
      (row) => row
    )

    const byInstrument = await pg.map<Breakdown>(
      `${withMnxClicks}
       select
         coalesce(symbol, '(unrecorded)') as label,
         count(*)::int as clicks,
         count(distinct user_id)::int as users
       from mnx_clicks
       group by 1
       order by clicks desc, label`,
      params,
      (row) => row
    )

    // Who. Signed-out clicks carry only a device id, so they are counted in
    // the totals above and cannot appear here.
    const clickers = await pg.map<Clicker>(
      `${withMnxClicks}
       select u.username, u.name, count(*)::int as clicks
       from mnx_clicks c
       join users u on u.id = c.user_id
       group by 1, 2
       order by clicks desc, u.username
       limit $3`,
      [...params, top],
      (row) => row
    )

    console.log(`\n=== MNX click-throughs, last ${days} day(s) ===`)
    console.log(`Event:              ${MNX_CLICK_EVENT}`)
    console.log(`Clicks:             ${totals.clicks}`)
    console.log(`Signed-in clickers: ${totals.signed_in_users}`)
    console.log(`Anonymous devices:  ${totals.anonymous_devices}`)
    console.log(`Markets clicked:    ${totals.markets}`)

    printBreakdown('By placement', byLocation)
    printBreakdown('By instrument', byInstrument)

    console.log(`\n=== Top ${top} signed-in clickers ===`)
    if (!clickers.length) console.log('(none)')
    for (const clicker of clickers)
      console.log(
        `${pad(clicker.clicks, 5)}  ${clicker.name} — https://${
          ENV_CONFIG.domain
        }/${clicker.username}`
      )
  })
})
