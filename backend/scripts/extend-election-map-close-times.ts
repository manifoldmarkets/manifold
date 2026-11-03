// Keeps every market on the /election map open until its race is called.
// Most map markets were set to close on election night (the ManifoldPolitics
// House series at 7am ET on Nov 4, many community markets at 23:59 UTC on
// Nov 3), long before the results are final. The team resolves them by hand,
// so each one that would close earlier than --close is moved to --close.
//
// Dry run (lists every map market and what would change, writes nothing):
//   cd backend/scripts && npx ts-node extend-election-map-close-times.ts
// Apply:
//   npx ts-node extend-election-map-close-times.ts --apply
//     [--close <ISO time>]  default 2026-11-18T07:59:00Z (Nov 17, 11:59 PM PT)
//     [--as <userId>]       recorded as the editor, default @ManifoldPolitics
//     [--skip-closed]       leave markets that have already closed closed
//
// The market list is election-map-markets-2026.json: every market the map
// renders (senate2026, governors2026, HOUSE_DISTRICT_MARKETS,
// HOUSE_RACE_MARKETS and MIDTERMS_2026 in web/public/data, plus the ballot
// measure sources), resolved to ids on prod on 2026-11-03. A market that
// already closes on or after --close is left alone, so the Georgia and
// Louisiana runoff markets keep their December dates. Rerunning is a no-op.
//
// Each change is the same write as the update-market API: the closeTime field
// and a contract_edits row in one transaction under a row lock (re-checked
// there, so a market resolved in the meantime is skipped), then a page
// revalidation. There is no live broadcast: the API's websocket fan-out runs
// over a Redis only its instances reach, so a tab already open shows the new
// close time after a reload.

import * as fs from 'fs'
import * as path from 'path'
import { chunk, groupBy, sortBy } from 'lodash'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { tsToMillis } from 'common/supabase/utils'
import { runScript } from 'run-script'
import { updateContract } from 'shared/supabase/contracts'
import { getContract, revalidateContractStaticProps } from 'shared/utils'

type MapMarket = {
  id: string
  slug: string
  office: 'headline' | 'senate' | 'governor' | 'house' | 'measure'
  race: string
  question: string
}

type ContractRow = {
  id: string
  slug: string
  creator_username: string | null
  deleted: boolean | null
  resolution: string | null
  close_time: string | null
}

type Status = { deleted?: boolean; resolution?: string; closeTime?: number }

type Plan =
  | { action: 'extend'; currentClose: number; reopens: boolean }
  | { action: 'skip'; reason: string }

const DEFAULT_CLOSE = '2026-11-18T07:59:00Z'
const MANIFOLD_POLITICS_ID = 'vuI5upWB8yU00rP7yxj95J2zd952'
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EXTENSION_DAYS = 60
const REVALIDATE_BATCH = 10

const MAP_MARKETS: MapMarket[] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'election-map-markets-2026.json'),
    'utf8'
  )
).markets

const planFor = (
  status: Status | undefined,
  newClose: number,
  now: number,
  skipClosed: boolean
): Plan => {
  if (!status) return { action: 'skip', reason: 'not found' }
  if (status.deleted) return { action: 'skip', reason: 'deleted' }
  if (status.resolution)
    return { action: 'skip', reason: `resolved ${status.resolution}` }
  const currentClose = status.closeTime
  // No close time means it never closes: nothing to extend.
  if (currentClose == null) return { action: 'skip', reason: 'no close time' }
  if (!Number.isFinite(currentClose))
    return { action: 'skip', reason: 'unreadable close time' }
  if (currentClose >= newClose)
    return { action: 'skip', reason: 'already closes later' }
  const reopens = currentClose <= now
  if (reopens && skipClosed)
    return { action: 'skip', reason: 'already closed (--skip-closed)' }
  return { action: 'extend', currentClose, reopens }
}

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'

const FLAGS = ['--apply', '--skip-closed']
const VALUE_FLAGS = ['--close', '--as']

// A mistyped flag (--close=..., --dry) must not fall back to a default.
const checkArgs = (args: string[]) => {
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.includes(args[i])) i++
    else if (!FLAGS.includes(args[i]))
      throw new Error(
        `Unknown argument ${args[i]}. Use ${[...FLAGS, ...VALUE_FLAGS].join(
          ', '
        )} (values after a space).`
      )
  }
}

const argValue = (args: string[], flag: string) => {
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  const value = args[i + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

runScript(async ({ pg }) => {
  const args = process.argv.slice(2)
  checkArgs(args)
  const apply = args.includes('--apply')
  const skipClosed = args.includes('--skip-closed')
  const editorId = argValue(args, '--as') ?? MANIFOLD_POLITICS_ID
  const newClose = Date.parse(argValue(args, '--close') ?? DEFAULT_CLOSE)
  const now = Date.now()
  if (!Number.isFinite(newClose)) throw new Error('--close is not a date')
  if (newClose <= now + DAY_MS)
    throw new Error('--close must be at least a day from now')
  if (newClose > now + MAX_EXTENSION_DAYS * DAY_MS)
    throw new Error(`--close must be within ${MAX_EXTENSION_DAYS} days`)

  const rows = new Map(
    (
      await pg.manyOrNone<ContractRow>(
        `select id, slug, data->>'creatorUsername' as creator_username,
           deleted, resolution, close_time
         from contracts where id = any($1::text[])`,
        [MAP_MARKETS.map((m) => m.id)]
      )
    ).map((r) => [r.id, r])
  )
  const statusOf = (row: ContractRow | undefined): Status | undefined =>
    row && {
      deleted: row.deleted ?? undefined,
      resolution: row.resolution ?? undefined,
      closeTime:
        row.close_time == null ? undefined : tsToMillis(row.close_time),
    }
  const link = (m: MapMarket) => {
    const row = rows.get(m.id)
    return row?.creator_username
      ? `https://${ENV_CONFIG.domain}/${row.creator_username}/${row.slug}`
      : m.id
  }

  const plans = MAP_MARKETS.map((market) => ({
    market,
    plan: planFor(statusOf(rows.get(market.id)), newClose, now, skipClosed),
  }))

  console.log(`New close time: ${fmt(newClose)}`)
  for (const [office, entries] of Object.entries(
    groupBy(plans, (p) => p.market.office)
  )) {
    console.log(`\n${office} (${entries.length})`)
    for (const { market, plan } of entries) {
      const status =
        plan.action === 'skip'
          ? `SKIP ${plan.reason}`
          : `${plan.reopens ? 'REOPEN' : 'EXTEND'} ${fmt(plan.currentClose)}`
      console.log(
        `  ${status.padEnd(28)} ${market.race.padEnd(12)} ${link(market)}`
      )
    }
  }

  // Soonest close first, so a slow run still reaches the urgent ones in time.
  const toExtend = sortBy(
    plans.flatMap(({ market, plan }) =>
      plan.action === 'extend'
        ? [{ market, currentClose: plan.currentClose }]
        : []
    ),
    (p) => p.currentClose
  )
  const reopening = plans.filter(
    (p) => p.plan.action === 'extend' && p.plan.reopens
  )
  const skipped = plans.filter((p) => p.plan.action === 'skip')
  console.log(
    `\n${MAP_MARKETS.length} map markets: ${toExtend.length} to extend to ${fmt(
      newClose
    )} (${reopening.length} of them already closed and would reopen), ${
      skipped.length
    } skipped.`
  )
  if (!apply) {
    console.log('Dry run. Pass --apply to change the close times.')
    return
  }

  const extended: Contract[] = []
  const failed: { id: string; error: string }[] = []
  for (const { market } of toExtend) {
    try {
      const before = await pg.tx(async (tx) => {
        await tx.oneOrNone(
          `select id from contracts where id = $1 for update`,
          [market.id]
        )
        const contract = await getContract(tx, market.id)
        // Re-check under the lock, in case the market moved since the read.
        const plan = planFor(contract, newClose, Date.now(), skipClosed)
        if (!contract || plan.action === 'skip') {
          console.log(
            `  skip ${market.id}: ${plan.action === 'skip' ? plan.reason : ''}`
          )
          return undefined
        }
        await updateContract(
          tx,
          market.id,
          { closeTime: newClose, lastUpdatedTime: Date.now() },
          { broadcast: false }
        )
        // The row recordContractEdit writes (the pre-update contract), but in
        // this transaction, so a failure rolls the change back for a rerun.
        await tx.none(
          `insert into contract_edits (contract_id, editor_id, data, updated_keys)
           values ($1, $2, $3, $4)
           on conflict do nothing`,
          [contract.id, editorId, contract, ['closeTime']]
        )
        return contract
      })
      if (!before) continue
      extended.push(before)
      console.log(`  extended ${market.id} ${contractPath(before)}`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      failed.push({ id: market.id, error })
      console.log(`  FAILED ${market.id}: ${error}`)
    }
  }
  console.log(
    `\nExtended ${extended.length} markets to ${fmt(newClose)} as ${editorId}.`
  )

  // Pages are statically cached; refresh them so they show the new close.
  let revalidateFailures = 0
  for (const batch of chunk(extended, REVALIDATE_BATCH)) {
    await Promise.all(
      batch.map((c) =>
        revalidateContractStaticProps(c).catch((e) => {
          revalidateFailures++
          console.log(
            `  revalidate failed ${c.id}: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
        })
      )
    )
  }
  console.log(
    `Revalidated ${extended.length - revalidateFailures} of ${
      extended.length
    } pages.`
  )
  if (failed.length) {
    console.log(`\n${failed.length} FAILED (rerun to retry, it is idempotent):`)
    for (const f of failed) console.log(`  ${f.id}: ${f.error}`)
  }
})
