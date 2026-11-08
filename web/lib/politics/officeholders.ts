// Who holds each seat on /election's map: every senator (with the year their
// seat is next on the ballot), every governor and every House member, as
// seated now, plus the 2026 winner where one takes the seat in January 2027.
// Written by web/scripts/election-officeholders.ts into
// web/public/data/election-officeholders.json; rerun it after January 3,
// 2027 and the new Congress is simply who's seated. Pure helpers here.

export type OfficeParty = 'D' | 'R' | 'I'
export type Holder = { name: string; party: OfficeParty }
// A seat as held now; `elected` is a 2026 winner who isn't the holder and
// takes the seat in January 2027.
export type Seat = Holder & { elected?: Holder }
// A Senate seat also says when it's next on the ballot.
export type SenateSeat = Seat & { next: number }

export type OfficeholdersFile = {
  asOf: string
  sources: string[]
  senate: Record<string, SenateSeat[]>
  governor: Record<string, Seat>
  house: Record<string, Seat>
  // House seats with no member right now (a death or resignation).
  vacant: string[]
  // Seats whose 2026 winner couldn't be named yet (unresolved, or a
  // same-party race the market can't tell apart).
  pending: string[]
}

export const partyOf = (party: string | undefined): OfficeParty =>
  /^d/i.test(party ?? '') ? 'D' : /^r/i.test(party ?? '') ? 'R' : 'I'

// Two spellings of one person ("Nicholas J. Begich III", "Nick Begich"):
// the same last name, ignoring suffixes and punctuation. Only ever compared
// within one seat, where that's enough.
export function samePerson(a: string, b: string): boolean {
  const last = (name: string) =>
    name
      .toLowerCase()
      .replace(/[.,'’]/g, '')
      .replace(/\s+(jr|sr|ii|iii|iv)$/i, '')
      .trim()
      .split(/\s+/)
      .pop()
  return !!a && !!b && last(a) === last(b)
}

// The winner of a 2026 race, named from its candidates: by the answer the
// market resolved to (a person's name), else by the winning party, when
// exactly one candidate ran for it. Undefined when that doesn't single
// anyone out (two Republicans in a top-two race).
export function nameWinner(
  candidates: { name: string; party: string }[],
  won: { party?: OfficeParty; text?: string }
): Holder | undefined {
  if (won.text) {
    const byName = candidates.find((c) => samePerson(c.name, won.text ?? ''))
    if (byName) return { name: byName.name, party: partyOf(byName.party) }
  }
  if (!won.party) return undefined
  const ofParty = candidates.filter((c) => partyOf(c.party) === won.party)
  return ofParty.length === 1
    ? { name: ofParty[0].name, party: won.party }
    : undefined
}

// The year a senator's seat is next on the ballot: class 1 in 2030, class 2
// in 2032 (it was just elected in 2026), class 3 in 2028.
export const nextSenateElection = (cls: number) =>
  cls === 1 ? 2030 : cls === 2 ? 2032 : 2028

// ------------------------------------------------------------ lookups

export const senatorsOf = (file: OfficeholdersFile, state: string) =>
  [...(file.senate[state] ?? [])].sort((a, b) => a.next - b.next)

export const governorOf = (file: OfficeholdersFile, state: string) =>
  file.governor[state]

// A district's member ('PA-7'; at-large and delegates are 'AK-0', 'DC-0').
export const representativeOf = (file: OfficeholdersFile, key: string) =>
  file.house[key]

// A state's House delegation by party, as seated (one consistent picture:
// only the competitive districts' 2026 winners are named before January).
export function houseDelegation(file: OfficeholdersFile, state: string) {
  const seats = Object.entries(file.house)
    .filter(([key]) => key.split('-')[0] === state)
    .map(([, seat]) => seat)
  const count = (p: OfficeParty) => seats.filter((s) => s.party === p).length
  return { D: count('D'), R: count('R'), I: count('I'), total: seats.length }
}

// "Josh Shapiro (D)"
export const holderText = (h: Holder) => `${h.name} (${h.party})`
