// Question, description and search-term templates for the generic party
// markets. Every description states which round counts, the party rule,
// the N/A cases and (for presidential markets) the elector rules.
import {
  CycleConfig,
  congressionalRound,
  governorRound,
  longDate,
  presidentialRound,
  RoundRule,
} from './cycles'
import { ORDINAL, Race } from './inventory'

export const ANSWERS = [
  'Democratic Party',
  'Republican Party',
  'Another party or independent',
] as const

export const ANSWER_META = [
  { label: 'Democratic Party', kind: 'party', party: 'D' },
  { label: 'Republican Party', kind: 'party', party: 'R' },
  { label: 'Another party or independent', kind: 'other', party: 'other' },
] as const

const districtLabel = (race: Race) =>
  race.district === 0
    ? `${race.stateName}'s at-large district`
    : `${race.stateName}'s ${ORDINAL(race.district!)} District`

export function roundFor(race: Race, cfg: CycleConfig): RoundRule {
  if (race.office === 'president') return presidentialRound(race.state, cfg)
  if (race.office === 'governor') return governorRound(race.state, cfg)
  return congressionalRound(race.state, race.office, cfg)
}

export function questionFor(race: Race): string {
  const { cycle, stateName } = race
  switch (race.office) {
    case 'senate':
      return `Which party will win the ${cycle} U.S. Senate election in ${stateName}?`
    case 'governor':
      return `Which party will win the ${cycle} ${stateName} governor election?`
    case 'house':
      return `Which party will win the ${cycle} U.S. House election in ${districtLabel(
        race
      )}?`
    case 'president':
      if (race.state === 'US')
        return `Which party will win the ${cycle} U.S. presidential election?`
      if (race.district !== undefined)
        return `Which party will win ${stateName}'s ${ORDINAL(
          race.district
        )} District (${race.state}-${
          race.district
        }) in the ${cycle} presidential election?`
      return `Which party will win ${
        race.state === 'DC' ? 'the ' : ''
      }${stateName} in the ${cycle} presidential election?`
  }
}

const PARTY_RULE = `**Party rule:** the winner's party is the party on whose ballot line, or with whose party designation, they appear on the official general-election ballot. A candidate nominated by the Democratic Party or the Republican Party who also appears on other parties' lines (fusion) counts as that major party's candidate. A candidate who is independent, unaffiliated, has no party preference, or belongs to any other party resolves to "Another party or independent", even if they caucus with a major party or previously ran in a major party's primary. Party switches, caucus decisions, resignations or deaths after the result is certified do **not** change the resolution.`

const RESULTS_RULE = (certifier: string) =>
  `**Results:** resolves on ${certifier}. It may resolve earlier once the Associated Press has called the race and no recount, contest or further round that could change the winner remains pending. If a recount or court-ordered correction changes the certified winner before resolution, the corrected certified result controls.`

const SEED_LINE = (seedText: string) =>
  `**Starting probabilities** are seeds for the initial pool, not forecasts: ${seedText}`

export function descriptionFor(
  race: Race,
  cfg: CycleConfig,
  seedText: string
): string {
  const { cycle, stateName } = race
  const round = roundFor(race, cfg)
  const noElection = (what: string, term: string) =>
    `**No election or postponement:** if the ${what} is postponed, the market stays open until the rescheduled election for the same term. If no election for ${term} is held (for example it is cancelled, or the office or seat is abolished), the market resolves N/A. A special election for a different term does not count.`
  switch (race.office) {
    case 'senate':
      return [
        `This market resolves to the **party** of the winner of the ${cycle} election for **U.S. Senator from ${stateName}** (${race.seat}).`,
        '',
        `**Which round counts:** ${round.text}. Primaries, conventions and party runoffs do not count.`,
        '',
        PARTY_RULE,
        '',
        RESULTS_RULE("the state's certified results"),
        '',
        noElection(`${cycle} general election`, `this seat and term`),
        '',
        SEED_LINE(seedText),
      ].join('\n')
    case 'governor':
      return [
        `This market resolves to the **party** of the winner of the ${cycle} election for **Governor of ${stateName}** (${race.seat}).`,
        '',
        `**Which round counts:** ${round.text}. Primaries and conventions do not count.`,
        '',
        PARTY_RULE,
        '',
        RESULTS_RULE("the state's certified results"),
        '',
        noElection(`${cycle} general election`, `this office and term`),
        '',
        SEED_LINE(seedText),
      ].join('\n')
    case 'house': {
      const n = race.district!
      const number = n === 0 ? 'the at-large seat' : `district ${n}`
      return [
        `This market resolves to the **party** of the winner of the ${cycle} election for **U.S. Representative for ${districtLabel(
          race
        )}** — the term beginning January 3, ${cycle + 1}.`,
        '',
        `**District:** ${
          n === 0
            ? `${stateName}'s single, at-large congressional district`
            : `the district numbered ${n} on the congressional map in effect for the ${cycle} election`
        }. Mid-decade redistricting is active: if ${stateName} adopts a new map before the election that keeps ${
          n === 0 ? 'a single at-large seat' : `a district numbered ${n}`
        }, the market follows ${number} on that map, however much the boundaries change. If the state **abolishes** ${number} or **renumbers** its districts before the election (so that the new district numbers do not correspond to the current ones), or if the state's number of seats changes, the market resolves **N/A**.`,
        '',
        `**Which round counts:** ${round.text}. Primaries, conventions and party runoffs do not count.`,
        '',
        PARTY_RULE,
        '',
        RESULTS_RULE("the state's certified results"),
        '',
        noElection(`${cycle} general election`, `this district and term`),
        '',
        SEED_LINE(seedText),
      ].join('\n')
    }
    case 'president':
      return race.state === 'US'
        ? nationalDescription(race, cfg, round, seedText)
        : stateDescription(race, cfg, round, seedText)
  }
}

const PRESIDENT_PARTY_RULE = `**Party rule:** the party is the party designation under which the winning presidential ticket appears on the official general-election ballot. A ticket nominated by the Democratic Party or the Republican Party that also appears on other parties' lines (fusion) counts as that major party. A ticket that is independent, unaffiliated or nominated by any other party resolves to "Another party or independent". A candidate's later party change does not change the resolution.`

function stateDescription(
  race: Race,
  cfg: CycleConfig,
  round: RoundRule,
  seedText: string
) {
  const { cycle, stateName } = race
  const district = race.district !== undefined
  const unit = district
    ? `the electoral vote of **${stateName}'s ${ORDINAL(
        race.district!
      )} congressional district** (${race.state}-${race.district})`
    : `**${stateName}'s electoral votes**`
  const statute = district
    ? race.state === 'ME'
      ? '21-A M.R.S. § 802'
      : 'Neb. Rev. Stat. § 32-710'
    : undefined
  return [
    `This market resolves to the **party** of the presidential ticket that wins ${unit} in the ${cycle} U.S. presidential election (${
      race.seat
    }${district ? `, under ${statute}` : ''}).`,
    '',
    `**Which round counts:** ${round.text}. Primaries and caucuses do not count.`,
    '',
    PRESIDENT_PARTY_RULE,
    '',
    `**Electors:** the market resolves on which ticket's slate of electors is certified as elected by the ${
      district ? 'district' : 'state'
    }'s voters (the state's certified results and certificate of ascertainment). How the electors later vote does not matter: faithless electors, replaced electors, or disputes when Congress counts the votes do **not** change the resolution.`,
    '',
    RESULTS_RULE(
      `${stateName}'s certified presidential results (certificate of ascertainment)`
    ),
    '',
    `**N/A:** the market resolves N/A if ${
      district
        ? `${stateName} stops awarding an elector by congressional district before this election, if this district no longer exists (for example after reapportionment), or`
        : ''
    } if no popular election for presidential electors is held in ${stateName} for the ${cycle} election (for example the election is cancelled, or electors are appointed without a popular vote). If the election is postponed, the market stays open until the rescheduled election.`,
    '',
    SEED_LINE(seedText),
  ].join('\n')
}

function nationalDescription(
  race: Race,
  cfg: CycleConfig,
  round: RoundRule,
  seedText: string
) {
  const { cycle } = race
  return [
    `This market resolves to the **party** of the candidate who wins the ${cycle} U.S. presidential election: the person elected President for the term beginning ${cfg.termStart.president} through the **Electoral College** — ${race.seat}.`,
    '',
    `**Which round counts:** ${
      round.text
    }, followed by the Electoral College vote and the counting of electoral votes by Congress in January ${
      cycle + 1
    } (3 U.S.C. § 15, as amended by the Electoral Count Reform Act of 2022). Primaries, caucuses and conventions do not count.`,
    '',
    PRESIDENT_PARTY_RULE,
    '',
    `**Winner:** the candidate declared elected President when Congress counts the electoral votes (a majority of the appointed electors, 270 of 538 under the current apportionment). **Faithless electors:** the market follows the count Congress accepts, so an elector's vote cast for someone other than their ticket's candidate counts as Congress counts it. **Contingent election:** if no candidate has a majority of electoral votes, the market resolves to the party (as defined above) of the person the House of Representatives elects President under the Twelfth Amendment.`,
    '',
    `**Results:** resolves on the official count of electoral votes by Congress. It may resolve earlier once the Associated Press has called the election and the result cannot change (no pending recount, contest or dispute could alter the Electoral College majority). If a court or certified correction changes the outcome before resolution, the corrected result controls.`,
    '',
    `**N/A:** if no presidential election for the term beginning ${cfg.termStart.president} is held (for example it is cancelled), the market resolves N/A. If the election is postponed, or a contingent election runs past Inauguration Day, the market stays open until a President is elected for that term.`,
    '',
    SEED_LINE(seedText),
  ].join('\n')
}

export function searchTermsFor(race: Race): string[] {
  const { cycle, stateName, state } = race
  switch (race.office) {
    case 'senate':
      return [
        `${stateName} Senate ${cycle}`,
        `${cycle} ${stateName} Senate election`,
        `${stateName} senator ${cycle}`,
        `${state} Senate ${cycle}`,
      ]
    case 'governor':
      return [
        `${stateName} governor ${cycle}`,
        `${cycle} ${stateName} gubernatorial`,
        `${stateName} governor election ${cycle}`,
      ]
    case 'house': {
      const n = race.district!
      return n === 0
        ? [
            `${stateName} at-large ${cycle}`,
            `${state}-AL ${cycle}`,
            `${stateName} House ${cycle}`,
            `${stateName} congressional ${cycle}`,
          ]
        : [
            `${stateName} ${ORDINAL(n)} district ${cycle}`,
            `${state}-${n} ${cycle}`,
            `${state}${String(n).padStart(2, '0')} ${cycle}`,
            `${stateName} House ${cycle}`,
            `${stateName} congressional ${cycle}`,
          ]
    }
    case 'president':
      if (state === 'US')
        return [
          `${cycle} presidential election`,
          `${cycle} president party`,
          `which party ${cycle} presidential`,
          `${cycle} US presidential election winner`,
          `Electoral College ${cycle}`,
        ]
      if (race.district !== undefined)
        return [
          `${state}-${race.district} ${cycle} presidential`,
          `${stateName} ${ORDINAL(race.district)} district ${cycle} president`,
          `${stateName} ${ORDINAL(race.district)} ${cycle} electoral vote`,
        ]
      if (state === 'DC')
        return [
          `District of Columbia ${cycle} presidential`,
          `DC ${cycle} presidential election`,
          `DC ${cycle} president`,
          `Washington DC ${cycle} electoral votes`,
        ]
      return [
        `${stateName} ${cycle} presidential`,
        `${stateName} ${cycle} president`,
        `${cycle} presidential election ${stateName}`,
        `${state} ${cycle} electoral votes`,
      ]
  }
}

export function shapeRationale(): string {
  return 'Generic ballot-party multi (Democratic Party / Republican Party / Another party or independent), opened years ahead with no candidates named. Party outcomes survive nominee changes and map directly to seat and elector totals; answers sum to one and cannot be added to.'
}

export function closeNote(cfg: CycleConfig): string {
  return `Close after US election-night counting has ended: noon UTC on ${longDate(
    cfg.electionDate
  )} + 1 day. Georgia Senate/House entries stay open through the ${longDate(
    cfg.georgiaRunoffDate
  )} runoff. The creator must still handle postponements and any later deciding round a state adds.`
}
