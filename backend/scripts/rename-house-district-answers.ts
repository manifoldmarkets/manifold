import { runScript } from 'run-script'

import { MAX_ANSWER_LENGTH } from 'common/answer'
import { isAdminId } from 'common/envs/constants'
import { recordContractEdit } from 'shared/record-contract-edit'
import { getAnswer, updateAnswer } from 'shared/supabase/answers'
import { getContract } from 'shared/utils'

/**
 * Renames the competitive answers on the community House-districts market to
 * carry the actual 2026 general-election matchups, so "Texas 15" reads as
 * "Texas 15 · Bobby Pulido (D) v. Monica De La Cruz (R)".
 *
 * Why rename rather than create per-district markets: server-sitemap.xml only
 * submits the top 1000 markets by importance score. This market sits at rank
 * ~163 and is indexed; sixteen fresh district markets would each start near
 * zero bettors, fall below the cutoff (8 bettors / 0.13 score) and not be
 * submitted at all. Renaming instead adds candidate names to a page Google
 * already crawls, and keeps the existing 59 traders and price history.
 *
 * Safety properties:
 *  - Dry run unless you pass --apply.
 *  - Each row only writes when the answer's current text is exactly `from`.
 *    Already-renamed rows are skipped, and anything unexpected aborts that row
 *    loudly rather than clobbering someone else's edit. Re-running is safe.
 *  - Only `text` is written. Answer ids, pools, probabilities and every
 *    position are untouched, and bets reference answerId rather than text, so
 *    API bots are unaffected. Each `to` also keeps `from` as an exact prefix,
 *    so a bot matching answers by substring still resolves them.
 *
 * Usage:
 *   EDITOR_USER_ID=<admin user id> npx ts-node rename-house-district-answers.ts
 *   EDITOR_USER_ID=<admin user id> npx ts-node rename-house-district-answers.ts --apply
 */

// Community market "Will a Democrat win these US House races in 2026?"
const CONTRACT_ID = 'sqUzOZN8Cs'

/**
 * The 16 answers inside the 30-70% band as of 2026-09-07 — the races actually
 * in play. The other 52 districts are decided and are deliberately left alone.
 *
 * Matchups verified against Ballotpedia's 2026 general-election candidate
 * lists on 2026-09-07. Democrat first, because this market resolves YES when a
 * Democrat wins: the leading name is the YES side.
 *
 * Where Ballotpedia's formal name differs from common usage we use common
 * usage, since these render to readers who do not follow these races:
 * Rob Wittman (Robert J.), Don Davis (Donald), Matt Dunlap (Matthew),
 * Mike Lawler (Michael).
 */
const RENAMES: { id: string; from: string; to: string }[] = [
  {
    id: 'nLn5L6SUnL',
    from: 'Virginia 1',
    to: 'Virginia 1 · Shannon Taylor (D) v. Rob Wittman (R)',
  },
  {
    // John Hoban (I) is also on this ballot; the two-way label is a
    // simplification of a three-way race.
    id: '0Rgcpgqd9R',
    from: 'Pennsylvania 1',
    to: 'Pennsylvania 1 · Bob Harvie (D) v. Brian Fitzpatrick (R)',
  },
  {
    id: 'nZt6lOtuyN',
    from: 'Texas 15',
    to: 'Texas 15 · Bobby Pulido (D) v. Monica De La Cruz (R)',
  },
  {
    id: 'N9065U0utg',
    from: 'North Carolina 1',
    to: 'North Carolina 1 · Don Davis (D) v. Laurie Buckhout (R)',
  },
  {
    id: 'zq5qO8ulEy',
    from: 'Michigan 4',
    to: 'Michigan 4 · Sean McCann (D) v. Bill Huizenga (R)',
  },
  {
    // Open seat: Jared Golden (D) is retiring.
    id: 'R6UZNEIts0',
    from: 'Maine 2',
    to: 'Maine 2 · Matt Dunlap (D) v. Paul LePage (R)',
  },
  {
    id: 'cEIzNR9hC2',
    from: 'Michigan 7',
    to: 'Michigan 7 · William Lawrence (D) v. Tom Barrett (R)',
  },
  {
    id: 'dAyEZZ22Eu',
    from: 'Pennsylvania 8',
    to: 'Pennsylvania 8 · Paige Cognetti (D) v. Rob Bresnahan Jr. (R)',
  },
  {
    // Open seat: John James (R) is running for governor.
    id: 'ddQhLzhn0h',
    from: 'Michigan 10',
    to: 'Michigan 10 · Christina Hines (D) v. Michael Bouchard (R)',
  },
  {
    id: 'Psgzgy6cs6',
    from: 'Colorado 3',
    to: 'Colorado 3 · Dwayne Romero (D) v. Jeff Hurd (R)',
  },
  {
    id: 'gq6qL5IOqZ',
    from: 'Wisconsin 1',
    to: 'Wisconsin 1 · Mitchell Berman (D) v. Bryan Steil (R)',
  },
  {
    // Open seat: Ryan Zinke (R) is not seeking another term.
    id: '20QdthsQ0y',
    from: 'Montana 1',
    to: 'Montana 1 · Sam Forstag (D) v. Aaron Flint (R)',
  },
  {
    id: 's289dU8Lyz',
    from: 'Wisconsin 3',
    to: 'Wisconsin 3 · Rebecca Cooke (D) v. Derrick Van Orden (R)',
  },
  {
    id: 'CCluI6IShq',
    from: 'Arizona 2',
    to: 'Arizona 2 · Jonathan Nez (D) v. Eli Crane (R)',
  },
  {
    // NY fusion voting: Ballotpedia also lists Conley on the Working Families
    // line and Lawler on the Conservative line.
    id: 'Nh2lQzdgdc',
    from: 'New York 17',
    to: 'New York 17 · Cait Conley (D) v. Mike Lawler (R)',
  },
  {
    id: 'Ons5IdIdyq',
    from: 'Ohio 9',
    to: 'Ohio 9 · Marcy Kaptur (D) v. Derek Merrin (R)',
  },
]

runScript(async ({ pg }) => {
  const apply = process.argv.includes('--apply')

  const editorId = process.env.EDITOR_USER_ID
  if (!editorId) {
    throw new Error(
      'Set EDITOR_USER_ID to the Manifold user id of the admin making this edit. ' +
        'It is recorded in contract_edits as the editor, so it must be a real account.'
    )
  }
  if (!isAdminId(editorId)) {
    throw new Error(
      `EDITOR_USER_ID ${editorId} is not an admin. edit-answer requires the ` +
        'contract owner, a mod, or an admin, and this market belongs to Robincvgr.'
    )
  }

  const contract = await getContract(pg, CONTRACT_ID)
  if (!contract) throw new Error(`Contract ${CONTRACT_ID} not found`)
  if (contract.mechanism !== 'cpmm-multi-1') {
    throw new Error(
      `Expected a multiple-choice market, got ${contract.mechanism}`
    )
  }

  // Fail before writing anything if any proposed text is too long.
  const tooLong = RENAMES.filter((r) => r.to.length > MAX_ANSWER_LENGTH)
  if (tooLong.length) {
    throw new Error(
      `Over the ${MAX_ANSWER_LENGTH} char limit: ${tooLong
        .map((r) => r.from)
        .join(', ')}`
    )
  }

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'} — ${RENAMES.length} answers on "${
      contract.question
    }"\n`
  )

  let renamed = 0
  let alreadyDone = 0
  const conflicts: string[] = []

  for (const { id, from, to } of RENAMES) {
    const answer = await getAnswer(pg, id)

    if (!answer) {
      conflicts.push(`${from}: answer ${id} not found`)
      continue
    }
    if (answer.text === to) {
      alreadyDone++
      console.log(`  = ${from} (already renamed)`)
      continue
    }
    // Guard against clobbering an edit someone else made in the meantime.
    if (answer.text !== from) {
      conflicts.push(
        `${from}: expected text "${from}" but found "${answer.text}" — skipped`
      )
      continue
    }

    console.log(`  ${apply ? '✓' : '·'} ${from}\n      -> ${to}`)
    if (apply) await updateAnswer(pg, id, { text: to })
    renamed++
  }

  if (apply && renamed > 0) {
    await recordContractEdit(contract, editorId, ['answers'])
  }

  console.log(
    `\n${
      apply ? 'Renamed' : 'Would rename'
    } ${renamed}; ${alreadyDone} already done; ${conflicts.length} conflicts.`
  )
  for (const c of conflicts) console.log(`  ! ${c}`)

  if (!apply) console.log('\nRe-run with --apply to write.')
})
