// Fixed facts per election cycle: dates, close times, idempotency series and
// the state-specific "which round counts" rules. Everything here is derived
// from statute or the calendar, never from a forecast.
import { Office } from 'shared/elections/election-market-creation'

// Launch scope (Tod, 2026-11-05): every general election from 2028 through
// 2036, the cutoff ("If the market set for 2036 is prepared, we should
// include it. That can be the cutoff, do 2034 as well then").
export type Cycle = 2028 | 2030 | 2032 | 2034 | 2036
export const CYCLES: readonly Cycle[] = [2028, 2030, 2032, 2034, 2036]

// Presidential years elect presidential electors and the eleven
// presidential-year governors; midterm years elect neither.
export const isPresidentialYear = (cycle: number) => cycle % 4 === 0

// Federal general elections fall on the Tuesday after the first Monday in
// November (2 U.S.C. § 7; 3 U.S.C. § 1).
export function electionDay(year: number): string {
  const nov1 = new Date(Date.UTC(year, 10, 1))
  const firstMonday = 1 + ((8 - nov1.getUTCDay()) % 7)
  return isoDate(Date.UTC(year, 10, firstMonday + 1))
}

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const addDays = (date: string, days: number) =>
  isoDate(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
// Markets close at noon UTC on the day after the deciding round, after US
// election-night counting has ended everywhere.
export const noonUtcAfter = (date: string) =>
  Date.parse(`${addDays(date, 1)}T12:00:00.000Z`)

export const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

export type CycleConfig = {
  cycle: Cycle
  series: string
  electionDate: string
  closeTime: number
  // O.C.G.A. § 21-2-501: a majority is required for Senate, House and
  // governor (not presidential electors); the runoff is on the 28th day after.
  georgiaRunoffDate: string
  georgiaCloseTime: number
  termStart: Record<Office, string>
  president: boolean
  house: boolean
}

export function cycleConfig(cycle: Cycle): CycleConfig {
  const electionDate = electionDay(cycle)
  const georgiaRunoffDate = addDays(electionDate, 28)
  return {
    cycle,
    series: `us-${cycle}-general-v1`,
    electionDate,
    closeTime: noonUtcAfter(electionDate),
    georgiaRunoffDate,
    georgiaCloseTime: noonUtcAfter(georgiaRunoffDate),
    termStart: {
      senate: `January 3, ${cycle + 1}`,
      house: `January 3, ${cycle + 1}`,
      president: `January 20, ${cycle + 1}`,
      governor: `January ${cycle + 1}`,
    },
    president: isPresidentialYear(cycle),
    // House districts only for 2028: the 2030 lines may still change
    // mid-decade, and 2032 onwards uses the 2030 census.
    house: cycle === 2028,
  }
}

// Expected calendar, verified by the tests against electionDay().
export const EXPECTED_ELECTION_DATES: Record<Cycle, string> = {
  2028: '2028-11-07',
  2030: '2030-11-05',
  2032: '2032-11-02',
  2034: '2034-11-07',
  2036: '2036-11-04',
}

export type RoundRule = {
  text: string
  closeTime: number
}

// Georgia (O.C.G.A. § 21-2-501): a majority wins; otherwise a runoff between
// the top two on the 28th day after. Senate, House and governor (2030) use it.
function georgiaMajorityRound(cfg: CycleConfig): RoundRule {
  return {
    text: `the ${longDate(
      cfg.electionDate
    )} general election if a candidate wins a majority of the votes; otherwise the ${longDate(
      cfg.georgiaRunoffDate
    )} runoff between the top two (O.C.G.A. § 21-2-501: majority required, runoff on the 28th day after)`,
    closeTime: cfg.georgiaCloseTime,
  }
}

// Alaska's top-four primary and ranked-choice general cover Senate, House and
// governor alike.
function alaskaRound(cfg: CycleConfig): RoundRule {
  return {
    text: `the ${longDate(
      cfg.electionDate
    )} general election under the system Alaska uses for it: the final round of ranked-choice tabulation under the current top-four system, or a plurality if voters repeal that system (a repeal initiative is on the November 3, 2026 ballot)`,
    closeTime: cfg.closeTime,
  }
}

// Which round decides a Senate or House seat, by state.
export function congressionalRound(
  state: string,
  office: 'senate' | 'house',
  cfg: CycleConfig
): RoundRule {
  const general = longDate(cfg.electionDate)
  if (state === 'GA') return georgiaMajorityRound(cfg)
  if (state === 'LA')
    return {
      text: `the ${general} general election, decided by plurality among the party nominees chosen in Louisiana's closed party primaries and any other qualified candidates (La. Act 1 of the 2024 First Extraordinary Session; the 2026-only open primary with a December runoff under HB 842 of 2026 does not apply to this election). If Louisiana adopts a system with a later deciding round for this election, that round counts and the creator will extend the close time`,
      closeTime: cfg.closeTime,
    }
  if (state === 'ME')
    return {
      text: `the ${general} general election, using the final round of ranked-choice tabulation if no candidate has a first-round majority (21-A M.R.S. § 723-A)`,
      closeTime: cfg.closeTime,
    }
  if (state === 'AK') return alaskaRound(cfg)
  if (state === 'MS' && office === 'senate')
    return {
      text: `the ${general} general election (plurality; Mississippi's majority/runoff rule applies to state offices, not to federal ones)`,
      closeTime: cfg.closeTime,
    }
  return {
    text: `the ${general} general election (plurality winner)`,
    closeTime: cfg.closeTime,
  }
}

export function governorRound(state: string, cfg: CycleConfig): RoundRule {
  const general = longDate(cfg.electionDate)
  if (state === 'VT')
    return {
      text: `the ${general} general election if a candidate wins a majority; if no one does, the Vermont General Assembly elects the governor from the top three by joint ballot in January ${
        cfg.cycle + 1
      } (Vt. Const. ch. II, § 47), and the market resolves to the party of the person it elects`,
      closeTime: cfg.closeTime,
    }
  if (state === 'WA')
    return {
      text: `the ${general} top-two general election (the two candidates who advance from the August primary; plurality of the two)`,
      closeTime: cfg.closeTime,
    }
  // The midterm-year governorships (2030) bring the states below.
  if (state === 'GA') return georgiaMajorityRound(cfg)
  if (state === 'AK') return alaskaRound(cfg)
  if (state === 'CA')
    return {
      text: `the ${general} top-two general election (the two candidates who advance from California's top-two primary; plurality of the two)`,
      closeTime: cfg.closeTime,
    }
  if (state === 'ME')
    return {
      text: `the ${general} general election (plurality winner: Maine's ranked-choice tabulation covers primaries and federal general elections, not the general election for governor, which its constitution decides by plurality; if Maine adopts ranked-choice tabulation for this election, the final round counts)`,
      closeTime: cfg.closeTime,
    }
  return {
    text: `the ${general} general election (plurality winner)`,
    closeTime: cfg.closeTime,
  }
}

export function presidentialRound(state: string, cfg: CycleConfig): RoundRule {
  const general = longDate(cfg.electionDate)
  if (state === 'ME')
    return {
      text: `the ${general} general election for presidential electors, using the final round of ranked-choice tabulation if no ticket has a first-round majority (21-A M.R.S. § 723-A applies to presidential electors)`,
      closeTime: cfg.closeTime,
    }
  if (state === 'AK')
    return {
      text: `the ${general} general election for presidential electors under the system Alaska uses for it: the final round of ranked-choice tabulation under the current system, or a plurality if voters repeal it (a repeal initiative is on the November 3, 2026 ballot)`,
      closeTime: cfg.closeTime,
    }
  if (state === 'GA')
    return {
      text: `the ${general} general election for presidential electors, by plurality (Georgia's majority/runoff rule does not apply to presidential electors: O.C.G.A. § 21-2-501)`,
      closeTime: cfg.closeTime,
    }
  return {
    text: `the ${general} general election for presidential electors (plurality)`,
    closeTime: cfg.closeTime,
  }
}
