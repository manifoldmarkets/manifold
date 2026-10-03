import { MultiContract, SORTS } from './contract'
import { Answer, getSortedAnswers, sortAnswers } from './answer'

const makeAnswer = (id: string, prob: number, index: number): Answer => ({
  id,
  index,
  contractId: 'c1',
  userId: 'u1',
  text: `Answer ${id}`,
  createdTime: 0,
  poolYes: 100,
  poolNo: 100,
  prob,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
})

const answers = [
  makeAnswer('a', 0.004, 0),
  makeAnswer('b', 0.5, 1),
  makeAnswer('c', 0.995, 2),
  makeAnswer('d', 0.4, 3),
  makeAnswer('e', 0.8, 4),
]

const contract = {
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: false,
  answers,
} as unknown as MultiContract

describe('prob-mid answer sort', () => {
  it('is listed between High % and Low %', () => {
    const values = SORTS.map((s) => s.value)
    expect(values.indexOf('prob-mid')).toBe(values.indexOf('prob-desc') + 1)
    expect(values.indexOf('prob-asc')).toBe(values.indexOf('prob-mid') + 1)
    expect(SORTS.find((s) => s.value === 'prob-mid')?.label).toBe('Mid %')
  })

  it('sorts answers by distance from 50%', () => {
    const sorted = sortAnswers(contract, answers, 'prob-mid')
    expect(sorted.map((a) => a.id)).toEqual(['b', 'd', 'e', 'c', 'a'])
  })

  it('hides answers at the extremes by default, unless selected', () => {
    const sorted = sortAnswers(contract, answers, 'prob-mid')
    expect(
      getSortedAnswers(contract, sorted, 'prob-mid').map((a) => a.id)
    ).toEqual(['b', 'd', 'e'])
    expect(
      getSortedAnswers(contract, sorted, 'prob-mid', ['a']).map((a) => a.id)
    ).toEqual(['b', 'd', 'e', 'a'])
  })
})
