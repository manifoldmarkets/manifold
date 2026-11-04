// Question, description and search-term templates for the generic party
// markets. Descriptions are short plain paragraphs (Tod, 2026-11-05): which
// election and date, the state's deciding-round rule where it differs, that
// only the party matters, how and when it resolves, and when it is N/A.
// Opening odds stay in the payload but are not described.
import { OTHER_ANSWER_TEXT } from 'shared/elections/election-market-creation'
import {
  CycleConfig,
  congressionalRound,
  governorRound,
  longDate,
  presidentialRound,
  RoundRule,
} from './cycles'
import { ORDINAL, Race, senateClassFor } from './inventory'

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

// Who the seed note says voted: "Alabama", "Alabama's 1st District",
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

// The full round rule (with statute citations) stays in the manifest's
// identity.round and the inventories; it also sets the close time.
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

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

// Minnesota's and North Dakota's Democratic parties use their own ballot
// names; say they count as Democratic.
const STATE_PARTY_LINE: Record<string, string> = {
  MN: 'The DFL line counts as Democratic.',
  ND: 'The Democratic-NPL line counts as Democratic.',
}
const withStateParty = (state: string) =>
  STATE_PARTY_LINE[state] ? ` ${STATE_PARTY_LINE[state]}` : ''

const PARTY_RULE = (state: string) =>
  `Only the party matters: a Democratic or Republican nominee counts as that party even if also listed on other parties' lines. Anyone else resolves to ${OTHER_ANSWER_TEXT}, or to their own answer if one has been added.${withStateParty(
    state
  )}`

const TICKET_PARTY_RULE = (state: string) =>
  `Only the party matters: a ticket on the Democratic or Republican line counts as that party even if also listed on other parties' lines. Any other ticket resolves to ${OTHER_ANSWER_TEXT}, or to its own answer if one has been added.${withStateParty(
    state
  )}`

const alaskaCount = (cycle: number) =>
  `The final count under whatever counting method Alaska uses in ${cycle} decides.`

// One short sentence for a state whose deciding round differs from a
// plurality on election day; undefined everywhere else.
export function roundSentence(
  race: Race,
  cfg: CycleConfig
): string | undefined {
  const { state, cycle, office } = race
  const georgiaRunoff = `If no candidate gets a majority, the ${longDate(
    cfg.georgiaRunoffDate
  )} runoff decides.`
  if (office === 'president') {
    if (state === 'ME')
      return 'If no ticket gets a first-round majority, the final ranked-choice round decides.'
    if (state === 'AK') return alaskaCount(cycle)
    return undefined
  }
  if (office === 'governor') {
    switch (state) {
      case 'VT':
        return `If no candidate gets a majority, the Vermont legislature picks the governor in January ${
          cycle + 1
        }, and that pick decides.`
      case 'WA':
        return "Washington's general election is between the top two primary finishers, whatever their parties."
      case 'CA':
        return "California's general election is between the top two primary finishers, whatever their parties."
      case 'GA':
        return georgiaRunoff
      case 'AK':
        return alaskaCount(cycle)
      case 'ME':
        return 'Decided by plurality, unless Maine extends ranked-choice counting to governor races, in which case the final round decides.'
      default:
        return undefined
    }
  }
  switch (state) {
    case 'GA':
      return georgiaRunoff
    case 'AK':
      return alaskaCount(cycle)
    case 'ME':
      return 'If no candidate gets a first-round majority, the final ranked-choice round decides.'
    case 'LA':
      return 'If Louisiana adds a later deciding round (such as a runoff) for this election, that round decides.'
    default:
      return undefined
  }
}

const withRound = (sentence: string, race: Race, cfg: CycleConfig) => {
  const round = roundSentence(race, cfg)
  return round ? `${sentence} ${round}` : sentence
}

const RESULTS = (what: string) =>
  `Resolves on the certified result, or earlier once the AP has called the race and no recount could change it. N/A if no election for this ${what} is held.`

export function descriptionFor(race: Race, cfg: CycleConfig): string {
  const { cycle, stateName, state } = race
  const date = longDate(cfg.electionDate)
  switch (race.office) {
    case 'senate':
      return [
        withRound(
          `Resolves to the party that wins the ${date} U.S. Senate election in ${stateName} (Class ${senateClassFor(
            cycle
          )} seat).`,
          race,
          cfg
        ),
        PARTY_RULE(state),
        RESULTS('seat'),
      ].join('\n\n')
    case 'governor':
      return [
        withRound(
          `Resolves to the party that wins the ${date} election for Governor of ${stateName}.`,
          race,
          cfg
        ),
        PARTY_RULE(state),
        RESULTS('office'),
      ].join('\n\n')
    case 'house': {
      const n = race.district!
      const where =
        n === 0
          ? `${stateName}'s at-large seat. N/A if ${stateName} has no at-large seat in ${cycle}.`
          : `${stateName}'s ${ORDINAL(
              n
            )} District: whichever district is numbered ${n} on the map in effect for that election. N/A if that map has no district numbered ${n}.`
      return [
        withRound(
          `Resolves to the party that wins the ${date} U.S. House election in ${where}`,
          race,
          cfg
        ),
        PARTY_RULE(state),
        RESULTS('seat'),
      ].join('\n\n')
    }
    case 'president':
      return state === 'US'
        ? nationalDescription(race, cfg)
        : stateDescription(race, cfg)
  }
}

// Presidential markets don't depend on the Electoral College (Tod,
// 2026-11-05): a state market follows who wins the state's presidential vote,
// a district market who gets the most votes in the district, and the national
// market whoever is elected President, however the winner is decided.
function stateDescription(race: Race, cfg: CycleConfig) {
  const { stateName, state } = race
  const date = longDate(cfg.electionDate)
  if (race.district !== undefined) {
    const where = `${stateName}'s ${ORDINAL(
      race.district
    )} congressional district (${state}-${race.district})`
    return [
      withRound(
        `Resolves to the party of the presidential ticket with the most votes in ${where} in the ${date} election.`,
        race,
        cfg
      ),
      TICKET_PARTY_RULE(state),
      `Resolves on ${stateName}'s certified result for the district, or earlier once the AP has called it and no recount could change it. N/A if no official presidential result is published for the district.`,
    ].join('\n\n')
  }
  const name = state === 'DC' ? 'the District of Columbia' : stateName
  const possessive =
    state === 'DC' ? "the District of Columbia's" : `${stateName}'s`
  const wins =
    state === 'ME' || state === 'NE' ? `${stateName} statewide` : name
  return [
    withRound(
      `Resolves to the party of the presidential ticket that wins ${wins} in the ${date} election.`,
      race,
      cfg
    ),
    TICKET_PARTY_RULE(state),
    `Resolves on ${possessive} certified result, or earlier once the AP has called it and no recount could change it. N/A if ${name} holds no presidential vote.`,
  ].join('\n\n')
}

function nationalDescription(race: Race, cfg: CycleConfig) {
  return [
    `Resolves to the party of the person elected President in the ${longDate(
      cfg.electionDate
    )} election, however the winner is officially decided.`,
    TICKET_PARTY_RULE(race.state),
    `N/A if no presidential election is held for the term starting ${cfg.termStart.president}.`,
  ].join('\n\n')
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
