import { getCpmmProbability } from './calculate-cpmm'
import { CPMMMultiContract } from './contract'
import { getNewContract } from './new-contract'
import { User } from './user'

const creator = {
  id: 'creator',
  name: 'Creator',
  username: 'creator',
  createdTime: 0,
} as User

function createIndependentMulti(answerProbabilities?: number[]) {
  return getNewContract({
    id: 'contract',
    slug: 'contract',
    creator,
    question: 'Which things will happen?',
    description: '',
    closeTime: Date.now() + 1000,
    visibility: 'public',
    outcomeType: 'MULTIPLE_CHOICE',
    initialProb: 50,
    ante: 300,
    min: 0,
    max: 0,
    isLogScale: false,
    answers: ['A', 'B', 'C'],
    addAnswersMode: 'DISABLED',
    shouldAnswersSumToOne: false,
    answerProbabilities,
    token: 'MANA',
    unit: undefined,
    midpoints: undefined,
    timezone: undefined,
    voterVisibility: undefined,
    pollType: undefined,
    maxSelections: undefined,
  }) as CPMMMultiContract
}

describe('getNewContract independent multiple choice', () => {
  it('defaults independent answers to 50%', () => {
    const contract = createIndependentMulti()

    expect(contract.shouldAnswersSumToOne).toBe(false)
    for (const answer of contract.answers) {
      expect(answer.prob).toBeCloseTo(0.5)
      expect(
        getCpmmProbability({ YES: answer.poolYes, NO: answer.poolNo }, 0.5)
      ).toBeCloseTo(0.5)
    }
  })

  it('supports custom independent answer probabilities', () => {
    const contract = createIndependentMulti([20, 50, 80])

    expect(contract.answers.map((answer) => answer.prob)).toEqual([
      0.2, 0.5, 0.8,
    ])
    for (const answer of contract.answers) {
      expect(
        getCpmmProbability({ YES: answer.poolYes, NO: answer.poolNo }, 0.5)
      ).toBeCloseTo(answer.prob)
      expect(Math.sqrt(answer.poolYes * answer.poolNo)).toBeCloseTo(
        answer.totalLiquidity
      )
    }
  })

  it('does not apply custom probabilities to sum-to-one markets', () => {
    const contract = getNewContract({
      id: 'contract',
      slug: 'contract',
      creator,
      question: 'Which one will happen?',
      description: '',
      closeTime: Date.now() + 1000,
      visibility: 'public',
      outcomeType: 'MULTIPLE_CHOICE',
      initialProb: 50,
      ante: 300,
      min: 0,
      max: 0,
      isLogScale: false,
      answers: ['A', 'B', 'C'],
      addAnswersMode: 'DISABLED',
      shouldAnswersSumToOne: true,
      answerProbabilities: [20, 50, 80],
      token: 'MANA',
      unit: undefined,
      midpoints: undefined,
      timezone: undefined,
      voterVisibility: undefined,
      pollType: undefined,
      maxSelections: undefined,
    }) as CPMMMultiContract

    for (const answer of contract.answers) {
      expect(answer.prob).toBeCloseTo(1 / 3)
    }
  })
})
