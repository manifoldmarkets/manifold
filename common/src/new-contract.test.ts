import { CPMMMultiContract } from './contract'
import { getNewContract, VERSUS_COLORS } from './new-contract'
import { User } from './user'

const creator = {
  id: 'creator',
  name: 'Creator',
  username: 'creator',
  createdTime: 0,
} as User

const makeMultiContract = (answers: string[], answerColors?: string[]) =>
  getNewContract({
    id: 'contract',
    slug: 'contract',
    creator,
    question: 'Who wins?',
    outcomeType: 'MULTIPLE_CHOICE',
    description: '',
    initialProb: 50,
    ante: 1000,
    closeTime: undefined,
    visibility: 'public',
    isTwitchContract: undefined,
    token: 'MANA',
    min: 0,
    max: 0,
    isLogScale: false,
    answers,
    answerColors,
    addAnswersMode: 'DISABLED',
    shouldAnswersSumToOne: true,
    unit: undefined,
    midpoints: undefined,
    timezone: undefined,
    voterVisibility: undefined,
    pollType: undefined,
    maxSelections: undefined,
  } as any) as CPMMMultiContract

describe('getNewContract answer colours', () => {
  it('gives a two-answer versus market the versus pair by default', () => {
    const { answers } = makeMultiContract(['Home', 'Away'])
    expect(answers.map((a) => a.color)).toEqual(VERSUS_COLORS)
  })

  it('leaves other markets to the chart palette', () => {
    const { answers } = makeMultiContract(['Home', 'Away', 'Draw'])
    expect(answers.map((a) => a.color)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('uses the colours it is given', () => {
    const versus = makeMultiContract(['Home', 'Away'], ['#E31837', '#AD9151'])
    expect(versus.answers.map((a) => a.color)).toEqual(['#E31837', '#AD9151'])
    const threeWay = makeMultiContract(
      ['Home', 'Away', 'Draw'],
      ['#F30107', '#E7CB04', '#A8A8A8']
    )
    expect(threeWay.answers.map((a) => a.color)).toEqual([
      '#F30107',
      '#E7CB04',
      '#A8A8A8',
    ])
  })
})
