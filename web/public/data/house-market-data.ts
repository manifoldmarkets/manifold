// Discovery candidates, NOT verified-equivalent resolution criteria.
// The October 1, 2026 description/comment audit found all six descriptions empty.
// Their titles ask whether Democrats win; ballot affiliation, fusion tickets,
// certification and third-party treatment have not been established as matching
// the original market. See ELECTION-ATLAS.md before promoting these mappings.
// The competitive-district market remains the first choice where it has odds.
export const HOUSE_DISTRICT_MARKETS = [
  'which-new-york-house-districts-will',
  'which-texas-house-districts-will-th',
  'which-florida-house-districts-will',
  'which-california-house-districts-wi',
  'which-nevada-us-house-seats-will-de',
  'which-iowa-congressional-districts',
]

// Candidate/party-winner leads retained in the prototype, pending criteria review.
// CA-7/34 explicitly say November; CO-1 has creator-comment general-election
// context. CA-4's description still references a primaries dashboard. None of
// these has established identical settlement semantics to the original market.
// Candidate party tags are not a ballot-affiliation rule, and WI-7's Republican
// NO is not necessarily Democratic YES. Do not treat this list as an approval.
export const HOUSE_RACE_MARKETS = [
  { district: 'CA-4', slug: 'who-will-win-the-ca4-house-election-0suAR0A066' },
  { district: 'CA-7', slug: '2026-us-house-ca-7-winner' },
  { district: 'CA-34', slug: '2026-us-house-ca34-winner' },
  { district: 'CO-1', slug: 'who-will-win-colorado-house-distric' },
  { district: 'KY-6', slug: 'who-will-win-kentuckys-6th-congress' },
  { district: 'OH-7', slug: 'which-party-wins-ohio-7th-congressi' },
  { district: 'OH-15', slug: 'which-party-will-win-ohios-15th-con' },
  {
    district: 'WI-7',
    slug: 'republicans-win-wisconsin-7th-congr',
  },
]
