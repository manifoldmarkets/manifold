import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BinaryContract } from 'common/contract'
import auditData from 'web/public/data/election-source-audit-2026.json'
import {
  answerParty,
  arrangeOutcomes,
  binaryRows,
  districtRows,
  candidateName,
  orderBallot,
  outcomeRow,
  sameCandidate,
  sourceNotes,
  UNSPECIFIED_RULES,
} from './race-outcomes'
import { raceCandidates } from './election-candidates'

const row = (
  text: string,
  prob: number,
  ballot = raceCandidates('senate', 'ME'),
  audited?: Parameters<typeof outcomeRow>[2]
) => outcomeRow({ id: text, text, prob }, ballot, audited)

test('candidate names are read out of raw answer labels', () => {
  assert.equal(candidateName('Josh Turek (Democrat)'), 'Josh Turek')
  assert.equal(candidateName('Mary Peltola (D)'), 'Mary Peltola')
  assert.equal(candidateName('Ashley Hinson (Republican)'), 'Ashley Hinson')
  assert.equal(candidateName('Independent (Dan Osborn)'), 'Dan Osborn')
  assert.equal(candidateName('Dan S. Sullivan (incumbent)'), 'Dan S. Sullivan')
  assert.equal(candidateName('Helena Foulkes'), 'Helena Foulkes')
  assert.equal(candidateName('Mark Green (R)'), 'Mark Green')
  for (const party of [
    'Democrats',
    'Democratic',
    'Democratic party',
    'Democratic Party',
    'Democrat',
    'Republicans',
    'Republican party',
    'Democrats OR Independents',
    'Independent (Other)',
    'Other',
    'Another candidate',
    'Third Party/Other',
    'Any other winner',
  ])
    assert.equal(candidateName(party), undefined, party)
})

test('every Dem/Rep label variant normalizes to one party label', () => {
  for (const text of [
    'Democrats',
    'Democratic',
    'Democratic party',
    'Democratic Party',
    'Democrat',
  ]) {
    const r = row(text, 0.6)
    assert.equal(r.party, 'D', text)
    assert.equal(r.label, 'Democratic', text)
    // Maine's sole Democratic nominee becomes the subtitle.
    assert.equal(r.subtitle, 'Troy Jackson', text)
    assert.equal(r.onBallot, true, text)
  }
  const rep = row('Republicans', 0.4)
  assert.equal(rep.label, 'Republican')
  assert.equal(rep.subtitle, 'Susan Collins')
  const turek = row(
    'Josh Turek (Democrat)',
    0.44,
    raceCandidates('senate', 'IA')
  )
  assert.equal(turek.label, 'Democratic')
  assert.equal(turek.subtitle, 'Josh Turek')
  assert.equal(turek.onBallot, true)
  const either = row('Democrats OR Independents', 0.5)
  assert.equal(either.label, 'Democratic or Independent')
})

test('audited parties win over label text', () => {
  const ballot = raceCandidates('governor', 'RI')
  const foulkes = row('Helena Foulkes', 0.98, ballot, 'D')
  assert.equal(foulkes.label, 'Democratic')
  assert.equal(foulkes.subtitle, 'Helena Foulkes')
  const block = row('Ken Block', 0.014, ballot, 'I')
  assert.equal(block.label, 'Independent')
  assert.equal(block.onBallot, true)
  const another = row('Another candidate', 0.002, ballot, 'other')
  assert.equal(another.label, 'Other')
  assert.equal(another.subtitle, 'Any other candidate')
  assert.equal(another.onBallot, false)
  assert.equal(answerParty('Tim Ryan', 'withdrawn'), 'unknown')
})

test('unaudited names fall back to the ballot party', () => {
  const ballot = raceCandidates('governor', 'RI')
  assert.equal(answerParty('Helena Foulkes', undefined, ballot), 'D')
  assert.equal(answerParty('Someone Unknown', undefined, ballot), 'other')
})

test('answers under 1% that are not on the ballot fold under "+N more"', () => {
  const nebraska = raceCandidates('senate', 'NE')
  const rows = [
    row('Republican', 0.71, nebraska, 'R'),
    row('Independent (Dan Osborn)', 0.29, nebraska, 'I'),
    // No Democrat is on Nebraska's ballot.
    row('Democratic', 0.002, nebraska, 'D'),
    row('Independent (Other)', 0.001, nebraska, 'I'),
  ]
  const { shown, folded } = arrangeOutcomes(rows)
  assert.deepEqual(
    shown.map((r) => r.label),
    ['Republican', 'Independent']
  )
  assert.equal(shown[0].subtitle, 'Pete Ricketts')
  assert.equal(shown[1].subtitle, 'Dan Osborn')
  assert.deepEqual(
    folded.map((r) => r.key),
    ['Democratic', 'Independent (Other)']
  )
  // Eliminated candidates fold away; a 0% candidate on the ballot stays.
  const ohio = raceCandidates('senate', 'OH')
  const candidates = arrangeOutcomes([
    row('Sherrod Brown', 0.59, ohio, 'D'),
    row('Jon Husted', 0.4, ohio, 'R'),
    row('Tim Ryan', 0.004, ohio, 'withdrawn'),
    row('Greg Levy', 0.003, ohio, 'I'),
    row('Other', 0.004, ohio, 'other'),
    row('Frank LaRose', 0.02, ohio, 'R'),
  ])
  assert.deepEqual(
    candidates.shown.map((r) => r.key),
    ['Sherrod Brown', 'Jon Husted', 'Frank LaRose', 'Greg Levy']
  )
  assert.deepEqual(
    candidates.folded.map((r) => r.key),
    ['Tim Ryan', 'Other']
  )
})

test('without a recorded ballot nothing is hidden', () => {
  const r = row('Other', 0.001, [])
  assert.equal(r.onBallot, true)
  assert.equal(arrangeOutcomes([r]).folded.length, 0)
})

test('matching names tolerates middle initials and suffixes', () => {
  assert.equal(sameCandidate('Nick Begich', 'Nick Begich III'), true)
  assert.equal(sameCandidate('Dan Sullivan', 'Dan S. Sullivan'), true)
  assert.equal(sameCandidate('Jame Timken', 'Jane Timken'), false)
  assert.equal(sameCandidate('', 'Jane Timken'), false)
})

test('ballot lists lead with the parties that can win', () => {
  const texas = raceCandidates('senate', 'TX')
  const ordered = orderBallot(texas, { dem: 0.65, rep: 0.35, other: 0 })
  assert.deepEqual(
    ordered.slice(0, 2).map((c) => c.party),
    ['D', 'R']
  )
  assert.notEqual(ordered[0].party, 'L')
  const nebraska = orderBallot(raceCandidates('senate', 'NE'), {
    dem: 0,
    rep: 0.71,
    other: 0.29,
  })
  assert.deepEqual(nebraska.map((c) => c.name).slice(0, 2), [
    'Pete Ricketts',
    'Dan Osborn',
  ])
  // Without odds: Democrat, Republican, then the rest in ballot order.
  assert.deepEqual(
    orderBallot([
      { name: 'Lib', party: 'L' },
      { name: 'Rep', party: 'R' },
      { name: 'Ind', party: 'I' },
      { name: 'Dem', party: 'D' },
    ]).map((c) => c.name),
    ['Dem', 'Rep', 'Ind', 'Lib']
  )
})

// A binary market at 60% YES.
const binary = (slug: string, id: string) =>
  ({
    slug,
    id,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    p: 0.5,
    pool: { YES: 2, NO: 3 },
  } as unknown as BinaryContract)

test('binary party questions show both parties in party colors (Maine)', () => {
  const maine = binaryRows(
    binary('will-the-democratic-party-candidate-NQOPZAnOA8', 'RcL0Q9O0EU'),
    { id: 'ME', candidates: raceCandidates('senate', 'ME') },
    'senate'
  )
  assert.equal(maine.YES.party, 'D')
  assert.equal(maine.YES.label, 'Democratic')
  assert.equal(maine.YES.subtitle, 'Troy Jackson')
  assert.ok(Math.abs(maine.YES.prob - 0.6) < 1e-9)
  assert.equal(maine.NO.party, 'R')
  assert.equal(maine.NO.label, 'Republican')
  assert.equal(maine.NO.subtitle, 'Susan Collins')
  // "Will a Republican win?" (Florida Senate): YES is the Republican.
  const florida = binaryRows(
    binary('will-a-republican-win-the-us-senate', 'CcysACRQAh'),
    { id: 'FL', candidates: raceCandidates('senate', 'FL') },
    'senate'
  )
  assert.equal(florida.YES.party, 'R')
  assert.equal(florida.NO.party, 'D')
})

test('candidate questions lead with the person and keep NO as anyone else', () => {
  const sullivan = binaryRows(
    binary('will-dan-sullivan-win-reelection-to', 'ULun8EOAAn'),
    { id: 'AK', candidates: raceCandidates('senate', 'AK') },
    'senate'
  )
  assert.equal(sullivan.YES.label, 'Dan S. Sullivan')
  assert.equal(sullivan.YES.party, 'R')
  assert.equal(sullivan.YES.subtitle, 'Republican candidate')
  assert.equal(sullivan.NO.party, 'any')
  assert.equal(sullivan.NO.label, 'Any other winner')
  // A mismatched contract id is not read as the audited source.
  const unaudited = binaryRows(
    binary('will-dan-sullivan-win-reelection-to', 'other-id'),
    { id: 'AK', candidates: raceCandidates('senate', 'AK') },
    'senate'
  )
  assert.equal(unaudited.YES.party, 'R')
  assert.equal(unaudited.YES.label, 'Republican')
})

test('district questions: Democratic vs Republican where one is running', () => {
  const ny14 = districtRows(0.82, {
    id: 'NY-14',
    candidates: raceCandidates('house', 'NY-14'),
  })
  assert.deepEqual(
    ny14.map((r) => [r.label, r.subtitle, r.party]),
    [
      ['Democratic', 'Alexandria Ocasio-Cortez', 'D'],
      ['Republican', 'Diamant Hysenaj', 'R'],
    ]
  )
  assert.ok(Math.abs(ny14[1].prob - 0.18) < 1e-9)
  // CA-6 (Pan vs. Kiley, an independent) has no Republican: NO stays
  // "any other winner".
  const none = districtRows(0.7, {
    id: 'CA-6',
    candidates: raceCandidates('house', 'CA-6'),
  })
  assert.equal(none[1].party, 'any')
})

test('source notes are written for readers; audit caveats never render', () => {
  const audit = auditData as unknown as {
    sources: Record<
      string,
      { contractId: string; confidence: string; caveats?: string[] }
    >
  }
  // Alaska Senate's party market is conditional: only the disclosure.
  const alaska = sourceNotes({
    id: '0L8uQURR06',
    slug: 'which-party-will-win-the-2026-alask',
  })
  assert.deepEqual(alaska, { bet: undefined, unspecifiedRules: true })
  // Maine's party binary is confirmed: no note at all.
  assert.deepEqual(
    sourceNotes({
      id: 'RcL0Q9O0EU',
      slug: 'will-the-democratic-party-candidate-NQOPZAnOA8',
    }),
    { bet: undefined, unspecifiedRules: false }
  )
  // A candidate bet explains Yes and No, from code.
  assert.equal(
    sourceNotes({
      id: 'ULun8EOAAn',
      slug: 'will-dan-sullivan-win-reelection-to',
    }).bet,
    'Yes = Dan S. Sullivan wins; No = anyone else, including another candidate from the same party.'
  )
  assert.equal(
    sourceNotes({ id: 'other', slug: 'which-party-will-win-the-2026-alask' })
      .unspecifiedRules,
    false
  )
  // No source's internal caveat text can reach the panel.
  for (const [slug, source] of Object.entries(audit.sources)) {
    const notes = sourceNotes({ id: source.contractId, slug })
    const text = [
      notes.bet ?? '',
      notes.unspecifiedRules ? UNSPECIFIED_RULES : '',
    ]
    for (const caveat of source.caveats ?? [])
      assert.ok(!text.some((t) => t && t.includes(caveat)), slug)
    assert.equal(notes.unspecifiedRules, source.confidence === 'conditional')
  }
})
