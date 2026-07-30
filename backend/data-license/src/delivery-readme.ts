// ---------------------------------------------------------------------------
// delivery-readme.ts — the README.md shipped INSIDE each delivery.
//
// Interpolates the manifest (row counts, snapshot, filter) into a human-readable
// description of the package.
// ---------------------------------------------------------------------------

import { Manifest } from './manifest'

const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`

// Assumed column notes per table. Replace with the final data dictionary.
const TABLE_DOCS: Record<string, { blurb: string; columns: string }> = {
  contracts: {
    blurb: 'One row per market (question). The canonical record is the `data` JSON column.',
    columns:
      '`id`, `creator_id` (pseudonymized), `question`, `created_time`, `close_time`, ' +
      '`resolution`, `resolution_time`, `resolution_probability`, `outcome_type`, ' +
      '`mechanism`, `visibility`, `token`, `data` (full JSON record).',
  },
  answers: {
    blurb: 'Answers for multiple-choice / multi markets. Binary markets have none.',
    columns:
      '`id`, `contract_id`, `user_id` (pseudonymized), `resolver_id` (pseudonymized), ' +
      '`text`, `prob`, `created_time`.',
  },
  contract_comments: {
    blurb: 'Comments on markets. Author identity is pseudonymized; free text is scrubbed.',
    columns:
      '`comment_id`, `contract_id`, `user_id` (pseudonymized), `created_time`, ' +
      '`data` (full JSON, incl. scrubbed rich-text `content`).',
  },
  contract_bets: {
    blurb: 'The order/trade log — the probability series. One row per bet/fill event.',
    columns:
      '`bet_id`, `contract_id`, `answer_id`, `user_id` (pseudonymized), `created_time`, ' +
      '`amount` (mana), `outcome`, `shares`, `prob_before`, `prob_after`, ' +
      '`is_redemption`, `data` (full JSON record).',
  },
  contract_liquidity: {
    blurb: 'Liquidity provision events per market.',
    columns: '`contract_id`, `liquidity_id`, `user_id` (pseudonymized), `amount`, `data`.',
  },
  txns: {
    blurb:
      'The financial transaction ledger — market-linked entries (payouts, antes, bonuses, ' +
      'subsidies, bounties, fees) AND platform-wide entries (transfers, purchases, loans, ' +
      'league prizes, quest/streak rewards). Entries referencing a non-public market are ' +
      'excluded. Endpoints are polymorphic; user endpoints are pseudonymized. Free-text ' +
      'messages and external payment metadata are removed.',
    columns:
      '`id`, `category`, `from_id`/`from_type`, `to_id`/`to_type` (user ids pseudonymized), ' +
      '`amount`, `token`, `created_time`, `data`.',
  },
  bot_accounts: {
    blurb:
      'Accounts carrying the user-level bot flag, as pseudonyms. Join against `user_id` in ' +
      'any table to include, exclude, or separately study algorithmic activity. Complements ' +
      'the per-trade `is_api` flag in contract_bets (API-placed orders).',
    columns: '`user_id` (pseudonymized).',
  },
}

export function buildDeliveryReadme(m: Manifest): string {
  const L: string[] = []
  L.push(`# Manifold — Licensed Data Delivery`)
  L.push('')
  L.push(`- **Delivery date:** ${m.deliveryDate}`)
  L.push(`- **Snapshot time (UTC):** ${m.snapshotTime}`)
  L.push(`- **Schema version:** ${m.schemaVersion}`)
  L.push(`- **Delivery fingerprint:** \`${m.saltFingerprint}\` (identifies the pseudonymization salt for this delivery)`)
  L.push('')
  L.push(`## Scope`)
  L.push('')
  L.push(
    `Public, non-deleted markets (\`visibility = '${m.filter.visibility}'\`, ` +
      `\`deleted = ${m.filter.deleted}\`), plus all child rows that reference an ` +
      `included market (transitive filter). \`txns\` ships the full financial ledger ` +
      `minus entries referencing an excluded market. Excluded: user profiles, embeddings, ` +
      `private/unlisted markets and their activity.`
  )
  L.push('')
  L.push(`## Contents`)
  L.push('')
  L.push(`Files are zstd-compressed Parquet, split into ~fixed-size numbered parts ` +
    `(e.g. \`contract_bets.0000.parquet\`). Timestamps are typed columns in UTC; ` +
    `monetary/probability fields are numeric; the \`data\` column is a JSON string. ` +
    `Product segments:`)
  L.push('')
  for (const [seg, info] of Object.entries(m.segments)) {
    L.push(`- **Segment ${seg} — ${info.label}:** ${info.tables.join(', ')}`)
  }
  L.push('')
  L.push(`| Table | Segment | Rows | Size | Parts |`)
  L.push(`|---|---|---:|---:|---:|`)
  for (const [name, t] of Object.entries(m.tables)) {
    L.push(`| ${name} | ${t.segment} | ${t.rowCount.toLocaleString()} | ${mb(t.bytes)} | ${t.parts} |`)
  }
  L.push('')
  L.push(`### Tables`)
  L.push('')
  for (const [name, t] of Object.entries(m.tables)) {
    const doc = TABLE_DOCS[name]
    if (!doc) continue
    L.push(`**${name}** (segment ${t.segment}) — ${doc.blurb}`)
    L.push('')
    L.push(`Columns: ${doc.columns}`)
    L.push('')
  }
  L.push('')
  L.push(`## Pseudonymization`)
  L.push('')
  L.push(
    `Every user identifier is replaced by a stable pseudonym of the form ` +
      `\`User_<hex>\` (HMAC-SHA256 under a per-recipient salt). Pseudonyms are ` +
      `consistent across all tables and across deliveries, so a user's activity ` +
      `joins across files and over time, but cannot be reversed to a real identity. ` +
      `Denormalized display identity (names, usernames, avatars) is removed; comment ` +
      `text has emails, phone numbers, and @-mentions scrubbed.`
  )
  L.push('')
  L.push(`## Definitions`)
  L.push('')
  L.push(
    `- **Executed trade:** a bet recorded in \`contract_bets\` that moved (or ` +
      `redeemed against) the market — i.e. an amount that was actually transacted, ` +
      `reflected by \`prob_before\` → \`prob_after\`. Unfilled resting limit-order ` +
      `amounts are not executed until matched.`
  )
  L.push(
    `- **Fully-filled order:** a limit order whose entire \`orderAmount\` has been ` +
      `matched (\`isFilled = true\` in the bet's \`data\`); no unfilled remainder ` +
      `stays on the book.`
  )
  L.push('')
  L.push(`## Denomination`)
  L.push('')
  L.push(
    `Monetary amounts are in **mana**, Manifold's play-money unit, unless the ` +
      `market/txn \`token\` is \`CASH\` (sweepstakes). Amounts are not USD.`
  )
  L.push('')
  L.push(`## Reading & verifying`)
  L.push('')
  L.push('```sql')
  L.push(`-- DuckDB: read all parts of a table`)
  L.push(`SELECT * FROM read_parquet('contract_bets.*.parquet') LIMIT 10;`)
  L.push('```')
  L.push('')
  L.push(
    `\`manifest.json\` lists every file with its byte size and SHA-256. After ` +
      `downloading, verify each file's checksum against the manifest to confirm an ` +
      `intact transfer. The presence of \`manifest.json\` marks a complete delivery.`
  )
  L.push('')
  return L.join('\n')
}
