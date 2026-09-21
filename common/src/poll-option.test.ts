import { POLL_OPTION_SORTS } from './contract'
import {
  PollOption,
  getDefaultPollSort,
  isPollOptionSort,
  sortPollOptions,
} from './poll-option'

const makeOption = (
  id: string,
  index: number,
  text: string,
  votes: number,
  rankedVoteScore?: number
): PollOption => ({ id, index, text, votes, rankedVoteScore })

// A Likert-style poll, the case where sorting by votes scrambles the scale.
const options = [
  makeOption('a', 0, 'Strongly disagree', 2, 3),
  makeOption('b', 1, 'Disagree', 5, 9),
  makeOption('c', 2, 'Neutral', 5, 1),
  makeOption('d', 3, 'agree', 0, 7),
  makeOption('e', 4, 'Strongly agree', 8, 4),
]

const ids = (sorted: PollOption[]) => sorted.map((o) => o.id)

describe('sortPollOptions', () => {
  it('defaults to most votes first, keeping ties in original order', () => {
    expect(ids(sortPollOptions({}, options))).toEqual(['e', 'b', 'c', 'a', 'd'])
    expect(ids(sortPollOptions({}, options, 'votes-desc'))).toEqual([
      'e',
      'b',
      'c',
      'a',
      'd',
    ])
  })

  it('sorts fewest votes first', () => {
    expect(ids(sortPollOptions({}, options, 'votes-asc'))).toEqual([
      'd',
      'a',
      'b',
      'c',
      'e',
    ])
  })

  it('restores the original order the creator listed', () => {
    const shuffled = [
      options[3],
      options[0],
      options[4],
      options[2],
      options[1],
    ]
    expect(ids(sortPollOptions({}, shuffled, 'original'))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('sorts alphabetically ignoring case', () => {
    expect(ids(sortPollOptions({}, options, 'alphabetical'))).toEqual([
      'd',
      'b',
      'c',
      'e',
      'a',
    ])
  })

  it('ranks ranked-choice polls by Borda score instead of votes', () => {
    const contract = { pollType: 'ranked-choice' as const }
    expect(ids(sortPollOptions(contract, options, 'votes-desc'))).toEqual([
      'b',
      'd',
      'e',
      'a',
      'c',
    ])
    expect(ids(sortPollOptions(contract, options, 'votes-asc'))).toEqual([
      'c',
      'a',
      'e',
      'd',
      'b',
    ])
  })

  it('uses the sort saved on the poll when none is given', () => {
    expect(ids(sortPollOptions({ sort: 'original' }, options))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('does not mutate the input', () => {
    const copy = [...options]
    sortPollOptions({}, options, 'alphabetical')
    expect(options).toEqual(copy)
  })
})

describe('getDefaultPollSort', () => {
  it('falls back to most votes when no sort is saved', () => {
    expect(getDefaultPollSort({})).toBe('votes-desc')
  })

  it('falls back to most votes when the saved sort is not a poll sort', () => {
    expect(getDefaultPollSort({ sort: 'prob-desc' as any })).toBe('votes-desc')
    expect(isPollOptionSort('prob-desc')).toBe(false)
  })

  it('accepts every listed poll sort', () => {
    for (const { value } of POLL_OPTION_SORTS) {
      expect(isPollOptionSort(value)).toBe(true)
      expect(getDefaultPollSort({ sort: value })).toBe(value)
    }
  })
})
