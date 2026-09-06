import { runScript } from 'run-script'

import { MAX_ANSWER_LENGTH } from 'common/answer'
import { isAdminId } from 'common/envs/constants'
import { recordContractEdit } from 'shared/record-contract-edit'
import { getAnswer, updateAnswer } from 'shared/supabase/answers'
import { getContract } from 'shared/utils'

/**
 * Renames answers on the community election markets the /election page renders,
 * so they name the actual 2026 candidates instead of bare parties or bare
 * district numbers.
 *
 * Two groups:
 *  - The House districts market, where "Texas 15" becomes
 *    "Texas 15 · Bobby Pulido (D) v. Monica De La Cruz (R)".
 *  - The competitive Senate party markets, where "Democratic party" becomes
 *    "Josh Turek (D)", so the party panel carries the names and the page no
 *    longer needs a second "who's running" card beside it.
 *
 * Why rename rather than create per-race markets: server-sitemap.xml only
 * submits the top 1000 markets by importance score. The districts market sits
 * at rank ~163 and is indexed; fresh per-race markets would each start near
 * zero bettors, fall below the cutoff (8 bettors / 0.13 score) and not be
 * submitted at all. Renaming adds candidate names to pages Google already
 * crawls and keeps the existing traders and price history.
 *
 * ⚠️ These markets resolve on PARTY, not on the named candidate. The "(D)" and
 * "(R)" tags are load-bearing: they keep the party meaning visible, and
 * isDemocraticAnswer/isRepublicanAnswer read them to colour the map. Maine is
 * the live proof that nominees change — Mills quit in April, Platner won the
 * primary and withdrew in July, and Troy Jackson was nominated on 25 July. If a
 * nominee changes again, re-run this with the new name; the market itself is
 * unaffected.
 *
 * Safety properties:
 *  - Dry run unless you pass --apply.
 *  - Each row only writes when the answer's current text is exactly `from`.
 *    Already-renamed rows are skipped and anything unexpected is reported
 *    rather than clobbered, so re-running is safe.
 *  - Only `text` is written. Answer ids, pools, probabilities and every
 *    position are untouched, and bets reference answerId rather than text, so
 *    API bots are unaffected. Each House `to` also keeps `from` as an exact
 *    prefix so substring matchers still resolve.
 *
 * Usage:
 *   EDITOR_USER_ID=<admin user id> npx ts-node rename-election-market-answers.ts
 *   EDITOR_USER_ID=<admin user id> npx ts-node rename-election-market-answers.ts --apply
 */

type Rename = { id: string; from: string; to: string }
type Group = { contractId: string; label: string; renames: Rename[] }

/**
 * The 16 House answers inside the 30-70% band as of 2026-09-07 — the races
 * actually in play. The other 52 districts are decided and are left alone.
 *
 * Matchups verified against Ballotpedia's 2026 general-election candidate lists
 * on 2026-09-07. Democrat first, because this market resolves YES when a
 * Democrat wins: the leading name is the YES side.
 *
 * Where Ballotpedia's formal name differs from common usage we use common
 * usage, since these render to readers who do not follow these races:
 * Rob Wittman (Robert J.), Don Davis (Donald), Matt Dunlap (Matthew),
 * Mike Lawler (Michael).
 */
const HOUSE_DISTRICTS: Rename[] = [
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

/**
 * The six Senate races inside the 30-70% band. "Other" answers are left alone —
 * they are neither party and the panel needs them to stay unmatched.
 *
 * Nominees verified 2026-09-07. Note the source markets label the two parties
 * inconsistently ("Democratic party" in most, "Democrats" in ME and OH), which
 * is why each `from` is spelled out rather than derived.
 */
const SENATE_PARTY_MARKETS: Group[] = [
  {
    contractId: 'tdA9NqRnpZ',
    label: 'TX Senate',
    renames: [
      { id: 'nPzz86h29l', from: 'Democratic party', to: 'James Talarico (D)' },
      { id: '0zuOCZ6I0P', from: 'Republican party', to: 'Ken Paxton (R)' },
    ],
  },
  {
    // Special election for the seat JD Vance resigned.
    contractId: '9cghzyIpRP',
    label: 'OH Senate (special)',
    renames: [
      { id: 'ntOCIdzuOS', from: 'Democrats', to: 'Sherrod Brown (D)' },
      { id: 'tNNdgss5Z6', from: 'Republicans', to: 'Jon Husted (R)' },
    ],
  },
  {
    // Open seat: Joni Ernst (R) is not seeking a third term.
    contractId: 'zncyEduLg6',
    label: 'IA Senate',
    renames: [
      { id: 'RQ8ygR96Ig', from: 'Democratic party', to: 'Josh Turek (D)' },
      { id: '0EPLPLLdLQ', from: 'Republican party', to: 'Ashley Hinson (R)' },
    ],
  },
  {
    // Troy Jackson was nominated 2026-07-25 after Graham Platner won the
    // primary and then withdrew. The community candidate market for this race
    // is stale and still lists Mills and Platner.
    contractId: 'UzNUOlCZgt',
    label: 'ME Senate',
    renames: [
      { id: 'duqy8qO6Np', from: 'Democrats', to: 'Troy Jackson (D)' },
      { id: '8UA2qd5Qqt', from: 'Republicans', to: 'Susan Collins (R)' },
    ],
  },
  {
    contractId: 'Ad6z6OsuQ5',
    label: 'MI Senate',
    renames: [
      { id: 'sIpZCI0zny', from: 'Democratic party', to: 'Abdul El-Sayed (D)' },
      { id: 'yAZRR9cQPZ', from: 'Republican party', to: 'Mike Rogers (R)' },
    ],
  },
  {
    // Ranked-choice, and the ballot carries a SECOND Dan Sullivan plus Gerald
    // Heikes (both R). "Dan Sullivan (R)" here means the incumbent.
    contractId: '0L8uQURR06',
    label: 'AK Senate',
    renames: [
      { id: 'PlyNQRgP2g', from: 'Democratic party', to: 'Mary Peltola (D)' },
      { id: 'nSqcNyOyNz', from: 'Republican party', to: 'Dan Sullivan (R)' },
    ],
  },
]

const GROUPS: Group[] = [
  {
    contractId: 'sqUzOZN8Cs',
    label: 'House districts',
    renames: HOUSE_DISTRICTS,
  },
  ...SENATE_PARTY_MARKETS,
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
        'contract owner, a mod, or an admin, and these are community markets.'
    )
  }

  const all = GROUPS.flatMap((g) => g.renames)
  const tooLong = all.filter((r) => r.to.length > MAX_ANSWER_LENGTH)
  if (tooLong.length) {
    throw new Error(
      `Over the ${MAX_ANSWER_LENGTH} char limit: ${tooLong
        .map((r) => r.from)
        .join(', ')}`
    )
  }

  console.log(
    `${apply ? 'APPLYING' : 'DRY RUN'} — ${all.length} answers across ${
      GROUPS.length
    } markets\n`
  )

  let renamed = 0
  let alreadyDone = 0
  const conflicts: string[] = []

  for (const group of GROUPS) {
    const contract = await getContract(pg, group.contractId)
    if (!contract) {
      conflicts.push(`${group.label}: contract ${group.contractId} not found`)
      continue
    }
    if (contract.mechanism !== 'cpmm-multi-1') {
      conflicts.push(
        `${group.label}: expected multiple choice, got ${contract.mechanism}`
      )
      continue
    }

    console.log(`${group.label} — "${contract.question}"`)
    let groupRenamed = 0

    for (const { id, from, to } of group.renames) {
      const answer = await getAnswer(pg, id)

      if (!answer) {
        conflicts.push(`${group.label}/${from}: answer ${id} not found`)
        continue
      }
      if (answer.contractId !== group.contractId) {
        conflicts.push(
          `${group.label}/${from}: answer ${id} belongs to ${answer.contractId}`
        )
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
          `${group.label}/${from}: expected "${from}" but found "${answer.text}" — skipped`
        )
        continue
      }

      console.log(`  ${apply ? '✓' : '·'} ${from} -> ${to}`)
      if (apply) await updateAnswer(pg, id, { text: to })
      groupRenamed++
    }

    if (apply && groupRenamed > 0) {
      await recordContractEdit(contract, editorId, ['answers'])
    }
    renamed += groupRenamed
    console.log('')
  }

  console.log(
    `${
      apply ? 'Renamed' : 'Would rename'
    } ${renamed}; ${alreadyDone} already done; ${conflicts.length} conflicts.`
  )
  for (const c of conflicts) console.log(`  ! ${c}`)

  if (!apply) console.log('\nRe-run with --apply to write.')
})
