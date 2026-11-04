// Question, description and search-term templates for the generic party
// markets. Every description states which round counts, the party rule,
// the N/A cases and (for presidential markets) the elector rules.
import { OTHER_ANSWER_TEXT } from 'shared/elections/election-market-creation'
import {
  CycleConfig,
  congressionalRound,
  governorRound,
  longDate,
  presidentialRound,
  RoundRule,
} from './cycles'
import { ORDINAL, Race } from './inventory'

// The two listed answers. Markets are created with addAnswersMode
// ONLY_CREATOR, so the server appends "Other" (at the remainder of the seeds)
// and only @ManifoldPolitics can add an answer later (a third party or a
// named independent), which takes its share out of "Other".
export const ANSWERS = ['Democratic Party', 'Republican Party'] as const

export const ANSWER_META = [
  { label: 'Democratic Party', kind: 'party', party: 'D' },
  { label: 'Republican Party', kind: 'party', party: 'R' },
  { label: OTHER_ANSWER_TEXT, kind: 'other', party: 'other', isOther: true },
] as const

// Who the seed paragraph says voted: "Alabama", "Alabama's 1st District",
// "The District of Columbia"; undefined for the national market.
export function seedPlace(race: Race): string | undefined {
  if (race.office === 'president' && race.state === 'US') return undefined
  if (race.district !== undefined && race.district > 0)
    return `${race.stateName}'s ${ORDINAL(race.district)} District`
  return race.state === 'DC' ? 'The District of Columbia' : race.stateName
}

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

// The Democratic Party's state parties in Minnesota and North Dakota appear on
// the ballot under their own names (the 2026 launch labelled the Minnesota
// answer "Democratic Party (DFL)"); say so, so that line is not read as
// "another party".
const DEMOCRATIC_STATE_PARTY: Record<string, string> = {
  MN: 'In Minnesota the Democratic Party appears on the ballot as the Democratic-Farmer-Labor Party (DFL), which counts as the Democratic Party here.',
  ND: 'In North Dakota the Democratic Party appears on the ballot as the Democratic-Nonpartisan League Party (Democratic-NPL), which counts as the Democratic Party here.',
}
const withStateParty = (state: string) =>
  DEMOCRATIC_STATE_PARTY[state] ? ` ${DEMOCRATIC_STATE_PARTY[state]}` : ''

const PARTY_RULE = (state: string) =>
  `**Party rule:** the winner's party is the party on whose ballot line, or with whose party designation, they appear on the official general-election ballot. A candidate nominated by the Democratic Party or the Republican Party who also appears on other parties' lines (fusion) counts as that major party's candidate.${withStateParty(
    state
  )} Any other winner (an independent, an unaffiliated candidate, someone with no party preference, or another party's candidate) resolves to the answer @ManifoldPolitics has added for that party or candidate, if there is one, and otherwise to "${OTHER_ANSWER_TEXT}", even if they caucus with a major party or previously ran in a major party's primary. Party switches, caucus decisions, resignations or deaths after the result is certified do **not** change the resolution.`

const ANSWERS_RULE = (what: 'candidate' | 'ticket') =>
  `**Answers:** only @ManifoldPolitics can add answers. It may add a third party or a named independent ${what} if one becomes a serious contender; a new answer takes its share out of "${OTHER_ANSWER_TEXT}", and a bet on "${OTHER_ANSWER_TEXT}" includes every answer added later.`

const RESULTS_RULE = (certifier: string) =>
  `**Results:** resolves on ${certifier}. It may resolve earlier once the Associated Press has called the race and no recount, contest or further round that could change the winner remains pending. If a recount or court-ordered correction changes the certified winner before resolution, the corrected certified result controls.`

// The seed paragraph is written in full by describeSeed (seeds.ts).
const SEED_LINE = (seedText: string) => seedText

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
        PARTY_RULE(race.state),
        '',
        ANSWERS_RULE('candidate'),
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
        PARTY_RULE(race.state),
        '',
        ANSWERS_RULE('candidate'),
        '',
        RESULTS_RULE("the state's certified results"),
        '',
        noElection(`${cycle} general election`, `this office and term`),
        '',
        SEED_LINE(seedText),
      ].join('\n')
    case 'house': {
      const n = race.district!
      return [
        `This market resolves to the **party** of the winner of the ${cycle} election for **U.S. Representative for ${districtLabel(
          race
        )}** — the term beginning January 3, ${cycle + 1}.`,
        '',
        n === 0
          ? `**District:** ${stateName}'s at-large seat, which covers the whole state. The market resolves **N/A** only if ${stateName} has no at-large seat in the ${cycle} election.`
          : `**District:** whichever district is numbered ${n} on the congressional map in effect for ${stateName}'s ${cycle} election, however much its boundaries differ from today's (states can redraw their maps before then). The market resolves **N/A** only if that map has no district numbered ${n}.`,
        '',
        `**Which round counts:** ${round.text}. Primaries, conventions and party runoffs do not count.`,
        '',
        PARTY_RULE(race.state),
        '',
        ANSWERS_RULE('candidate'),
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

const PRESIDENT_PARTY_RULE = (state: string) =>
  `**Party rule:** the party is the party designation under which the winning presidential ticket appears on the official general-election ballot. A ticket nominated by the Democratic Party or the Republican Party that also appears on other parties' lines (fusion) counts as that major party.${withStateParty(
    state
  )} Any other ticket (independent, unaffiliated or nominated by another party) resolves to the answer @ManifoldPolitics has added for that party or ticket, if there is one, and otherwise to "${OTHER_ANSWER_TEXT}". A candidate's later party change does not change the resolution.`

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
    PRESIDENT_PARTY_RULE(race.state),
    '',
    ANSWERS_RULE('ticket'),
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
    PRESIDENT_PARTY_RULE(race.state),
    '',
    ANSWERS_RULE('ticket'),
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
  return `Generic ballot-party multi (Democratic Party / Republican Party, plus the server's "${OTHER_ANSWER_TEXT}"), opened years ahead with no candidates named. Party outcomes survive nominee changes and map directly to seat and elector totals; answers sum to one, and only @ManifoldPolitics can add an answer (a third party or a named independent), which takes its share out of "${OTHER_ANSWER_TEXT}".`
}

export function closeNote(cfg: CycleConfig): string {
  return `Close after US election-night counting has ended: noon UTC on ${longDate(
    cfg.electionDate
  )} + 1 day. Georgia Senate/House/governor entries stay open through the ${longDate(
    cfg.georgiaRunoffDate
  )} runoff. The creator must still handle postponements and any later deciding round a state adds.`
}
