import { getCopiedAnswerProbs, hasAllAnswersForCopy } from './answer-probs'
import { getCpmmProbability } from './calculate-cpmm'
import { CPMMMultiContract } from './contract'
import { getAnswerProbsError, getNewContract } from './new-contract'
import { timePersonOfYear } from './test/fixtures/time-person-of-year'
import { User } from './user'

describe('duplicating the TIME Person of the Year legacy market', () => {
  const source = timePersonOfYear
  const listed = source.answers.filter((answer) => !answer.isOther)

  it('carries all 49 named odds with Other fitted into the same 100%', () => {
    const copied = getCopiedAnswerProbs(source, true)
    expect(copied).toEqual([
      3.4, 1.2, 1.3, 1, 1.8, 3.7, 2.3, 1, 1.5, 6.5, 17.3, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 2.9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      1.6, 1, 1, 1, 1, 1, 9.3,
    ])
    expect(copied).toHaveLength(listed.length)
    expect(100 - copied!.reduce((sum, prob) => sum + prob, 0)).toBeCloseTo(10.2)
    expect(
      getAnswerProbsError({
        answerProbs: copied!,
        numAnswers: listed.length,
        shouldAnswersSumToOne: true,
        hasOtherAnswer: true,
      })
    ).toBeUndefined()

    // The source engine is not copied: creation chooses the current engine.
    const created = getNewContract({
      id: 'copy',
      slug: 'copy',
      creator: { id: 'creator', name: 'Creator', username: 'creator' } as User,
      question: source.question,
      outcomeType: source.outcomeType,
      description: '',
      initialProb: 50,
      ante: 1000,
      closeTime: 1798761540000,
      visibility: 'public',
      min: 0,
      max: 0,
      isLogScale: false,
      answers: listed.map((answer) => answer.text),
      answerProbs: copied,
      addAnswersMode: source.addAnswersMode,
      shouldAnswersSumToOne: source.shouldAnswersSumToOne,
      token: 'MANA',
      unit: undefined,
      midpoints: undefined,
      timezone: undefined,
      voterVisibility: undefined,
      pollType: undefined,
      maxSelections: undefined,
    }) as CPMMMultiContract
    expect(created.mechanism).toBe('cpmm-multi-2')
    expect(created.answers.map((answer) => answer.text)).toEqual([
      ...listed.map((answer) => answer.text),
      'Other',
    ])
    created.answers.forEach((answer, index) => {
      const expected = index < listed.length ? copied![index] : 10.2
      expect(answer.prob * 100).toBeCloseTo(expected, 8)
      expect(
        getCpmmProbability(
          { YES: answer.poolYes, NO: answer.poolNo },
          answer.p
        ) * 100
      ).toBeCloseTo(expected, 8)
    })
  })

  it('waits for every source answer despite websocket additions reaching the old count', () => {
    const initial = { ...source, answers: source.answers.slice(0, 20) }
    const live = {
      ...initial,
      answers: [
        ...initial.answers,
        ...Array.from({ length: 30 }, (_, index) => ({
          id: `new-${index}`,
          text: `New answer ${index}`,
          prob: 0.01,
          isOther: false,
        })),
      ],
    }
    expect(live.answers).toHaveLength(source.answers.length)
    const incomplete = hasAllAnswersForCopy(initial, live, 50, false)
    expect(incomplete).toBe(false)
    expect(getCopiedAnswerProbs(live, incomplete)).toBeUndefined()
    const complete = hasAllAnswersForCopy(initial, source, 50, true)
    expect(complete).toBe(true)
    expect(getCopiedAnswerProbs(source, complete)).toHaveLength(49)
  })
})
