// Sources reviewed in the October 3 DB audit; many retain sparse criteria.
// The original portfolio stays first. Conditional sources are documented in
// backend/scripts/elections-2026/audit and remain distinct from verified
// equivalent ballot-party propositions.
export const HOUSE_DISTRICT_MARKETS = [
  'which-new-york-house-districts-will',
  // Jack1's Texas portfolio first: written criteria, ~4x per-answer liquidity.
  'which-texas-us-house-districts-will',
  'which-texas-house-districts-will-th',
  'which-florida-house-districts-will',
  'which-california-house-districts-wi',
  'which-nevada-us-house-seats-will-de',
  'which-iowa-congressional-districts',
  // Only the two reviewed answer IDs are eligible; other labels remain unreviewed.
  'which-us-house-districts-in-the-mid',
]

// Candidate/party-winner leads retained in the prototype, pending criteria review.
// CA-7/34 explicitly say November; CO-1 has creator-comment general-election
// context. CA-4's description still references a primaries dashboard. None of
// these has established identical settlement semantics to the original market.
// Candidate party tags are not a ballot-affiliation rule, and WI-7's Republican
// NO is not necessarily Democratic YES. Do not treat this list as an approval.
export const HOUSE_RACE_MARKETS: {
  district: string
  slug: string
  preferOverPortfolio?: boolean
}[] = [
  // Final November round, explicitly including Bill Hill (I). A Dem/Not-Dem
  // portfolio cannot express this race's Republican/independent contest.
  {
    district: 'AK-0',
    slug: 'who-will-win-the-alaska-house-elect',
    preferOverPortfolio: true,
  },
  // Same-party November ballots (CA SOS certified list, 8/27/2026). Party
  // comes from audited-sources' sameParty table, never from answer labels;
  // these markets supply candidate odds and bets. preferOverPortfolio because
  // the CA portfolio lets anyone add a district answer.
  {
    district: 'CA-4',
    slug: 'who-will-win-the-ca4-house-election-0suAR0A066',
    preferOverPortfolio: true,
  },
  {
    district: 'CA-7',
    slug: '2026-us-house-ca-7-winner',
    preferOverPortfolio: true,
  },
  {
    district: 'CA-11',
    slug: 'who-will-win-the-2026-election-for-AndtddsLn0',
    preferOverPortfolio: true,
  },
  // Candidate multi fallback if the more liquid binary is missing/cancelled.
  {
    district: 'CA-12',
    slug: '2026-california-12th-congressional',
    preferOverPortfolio: true,
  },
  // Candidate binary (YES = Jamie Joyce): candidate-only, never a party quote.
  {
    district: 'CA-12',
    slug: 'will-jamie-joyce-win-the-2026-12th',
    preferOverPortfolio: true,
  },
  {
    district: 'CA-14',
    slug: 'who-will-win-the-2026-election-for-chQddtRLUt',
    preferOverPortfolio: true,
  },
  {
    district: 'CA-34',
    slug: '2026-us-house-ca34-winner',
    preferOverPortfolio: true,
  },
  {
    district: 'CA-37',
    slug: '2026-californias-37th-congressional',
    preferOverPortfolio: true,
  },
  // R v R: must beat the original portfolio's resolved-NO "California 40".
  {
    district: 'CA-40',
    slug: 'who-will-win-the-us-house-race-in-c',
    preferOverPortfolio: true,
  },
  // CA-29 (D v D) has no market; it still counts D by ballot composition.
  { district: 'CO-1', slug: 'who-will-win-colorado-house-distric' },
  // Candidate binaries (YES = the named candidate): candidate-only.
  { district: 'CO-4', slug: 'will-lauren-boebert-be-reelected-to' },
  { district: 'AL-2', slug: 'will-democrat-shomari-figures-win-a' },
  { district: 'NC-9', slug: 'will-richard-ojeda-win-north-caroli' },
  { district: 'GA-1', slug: 'which-party-will-win-ga01-in-the-20' },
  { district: 'NC-11', slug: 'nc11-house-winner' },
  { district: 'WA-9', slug: 'who-will-win-washingtons-9th-house' },
  { district: 'MN-1', slug: 'who-will-win-the-us-house-seat-for' },
  // "Winner in November" party market, deeper than the Iowa portfolio answer.
  {
    district: 'IA-2',
    slug: 'which-party-will-win-the-iowas-2nd',
    preferOverPortfolio: true,
  },
  { district: 'KY-6', slug: 'who-will-win-kentuckys-6th-congress' },
  { district: 'OH-7', slug: 'which-party-wins-ohio-7th-congressi' },
  { district: 'OH-15', slug: 'which-party-will-win-ohios-15th-con' },
  {
    district: 'WI-7',
    slug: 'republicans-win-wisconsin-7th-congr',
  },
]
