import {
  confirmedCreationSelection,
  creationPreviewRequest,
  CreationRow,
  CreationScope,
} from './major-creation-selection'
const key = 'bdl:nba:7'
const second = 'bdl:nba:8'
const scope: CreationScope = {
  league: 'nba',
  competitionId: 'nba-regular-2026-27',
  force: false,
  keys: [],
}
const game: CreationRow = {
  league: 'nba',
  eventId: key,
  question: 'A at B',
  status: 'dry-run',
  reason: null,
  ante: 140,
  answerLabels: ['A', 'B'],
  confirmation: { awayId: 1, homeId: 2, startTime: 1_800_000_000_000 },
}
it('can preview a league without selecting games, but submits only checked, scoped games and exact earned confirmations', () => {
  expect(creationPreviewRequest(scope)).toMatchObject({
    dryRun: true,
    keys: undefined,
  })
  const other = { ...game, eventId: second }
  expect(confirmedCreationSelection([game, other], scope, [])).toBeUndefined()
  expect(confirmedCreationSelection([game, other], scope, [second])).toEqual({
    ...scope,
    keys: [second],
    dryRun: false,
    maxAntes: { [second]: 140 },
    confirmations: { [second]: game.confirmation },
  })
  expect(
    confirmedCreationSelection([game, other], { ...scope, keys: [key] }, [
      second,
    ])
  ).toBeUndefined()
})
it.each([['bdl:nba:7:total'], ['bdl:mlb:7'], ['bdl:nba:07'], ['bad']])(
  'rejects an invalid selected ID %s',
  (key) => {
    expect(creationPreviewRequest({ ...scope, keys: [key] })).toBeUndefined()
  }
)
it('accepts only explicit canceled replacements under Force; an ordinary game stays available in normal mode', () => {
  const force = { ...scope, force: true, keys: [key, second] }
  const replacement = {
    ...game,
    eventId: second,
    confirmation: {
      ...game.confirmation!,
      canceledContractIds: ['canceled-native'],
    },
  }
  expect(creationPreviewRequest({ ...force, keys: [] })).toBeUndefined()
  expect(creationPreviewRequest(force)).toMatchObject({
    force: true,
    keys: [key, second],
  })
  expect(
    confirmedCreationSelection([game, replacement], force, [key])
  ).toBeUndefined()
  expect(
    confirmedCreationSelection(
      [
        {
          ...game,
          confirmation: { ...game.confirmation!, canceledContractIds: [] },
        },
      ],
      force,
      [key]
    )
  ).toBeUndefined()
  expect(
    confirmedCreationSelection([game, replacement], force, [second])
      ?.confirmations[second]
  ).toEqual(replacement.confirmation)
  expect(
    confirmedCreationSelection([game, replacement], scope, [key])?.keys
  ).toEqual([key])
  expect(
    confirmedCreationSelection([game, replacement], scope, [second])
  ).toBeUndefined()
})
it.each<Partial<CreationRow>>([
  { status: 'skipped' },
  { confirmation: undefined },
  { answerLabels: [] },
  { answerLabels: [''] },
  { answerLabels: [' A ', 'a'] },
  { ante: undefined },
  { ante: 0 },
  { ante: NaN },
  { ante: 1.5 },
  { ante: 2147483648 },
  { league: 'nfl' },
  { confirmation: { ...game.confirmation!, awayId: 2 } },
  { confirmation: { ...game.confirmation!, startTime: 0 } },
])('withholds an incomplete or stale preview row %j', (patch) => {
  expect(
    confirmedCreationSelection([{ ...game, ...patch }], scope, [key])
  ).toBeUndefined()
})
it('rejects duplicate preview rows and keeps an unaffected checked game available', () => {
  const rows = [game, { ...game, ante: 150 }, { ...game, eventId: second }]
  expect(confirmedCreationSelection(rows, scope, [key])).toBeUndefined()
  expect(
    confirmedCreationSelection(rows, scope, [second, second])
  ).toBeUndefined()
  expect(confirmedCreationSelection(rows, scope, [second])?.maxAntes).toEqual({
    [second]: 140,
  })
})
