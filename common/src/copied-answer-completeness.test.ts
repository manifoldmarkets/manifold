import { getCopiedAnswerProbs, hasAllAnswersForCopy } from './answer-probs'

const answers = Array.from({ length: 21 }, (_, index) => ({
  id: `answer-${index}`,
  prob: 1 / 21,
}))
const initial = { id: 'market', answers: answers.slice(0, 20) }

describe.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
  '%s duplicate answer loading',
  (mechanism) => {
    it('does not treat a new answer as the missing answer during a slow fetch', () => {
      const live = {
        ...initial,
        answers: [...initial.answers, { id: 'new-answer', prob: 0.01 }],
      }
      // This reaches the server's old count, but answer-20 is still absent.
      expect(live.answers).toHaveLength(answers.length)
      const hasAllAnswers = hasAllAnswersForCopy(
        initial,
        live,
        answers.length,
        false
      )
      expect(hasAllAnswers).toBe(false)
      expect(
        getCopiedAnswerProbs(
          {
            ...live,
            mechanism,
            outcomeType: 'MULTIPLE_CHOICE',
            isResolved: false,
            shouldAnswersSumToOne: true,
            addAnswersMode: 'DISABLED',
          },
          hasAllAnswers
        )
      ).toBeUndefined()
    })

    it('stays incomplete after a failed fetch and more live updates', () => {
      const live = {
        ...initial,
        answers: [
          ...initial.answers,
          { id: 'new-answer-1', prob: 0.01 },
          { id: 'new-answer-2', prob: 0.01 },
        ],
      }
      expect(hasAllAnswersForCopy(initial, live, answers.length, false)).toBe(
        false
      )
    })

    it('enables every answer after a full fetch and carries supported odds', () => {
      const live = {
        id: initial.id,
        mechanism,
        outcomeType: 'MULTIPLE_CHOICE' as const,
        isResolved: false,
        shouldAnswersSumToOne: true,
        addAnswersMode: 'DISABLED' as const,
        answers,
      }
      const hasAllAnswers = hasAllAnswersForCopy(
        initial,
        live,
        answers.length,
        true
      )
      expect(hasAllAnswers).toBe(true)
      const copied = getCopiedAnswerProbs(live, hasAllAnswers)
      if (mechanism === 'cpmm-multi-2') {
        expect(copied).toHaveLength(answers.length)
        expect(copied!.reduce((sum, prob) => sum + prob, 0)).toBeCloseTo(100)
      } else {
        expect(copied).toBeUndefined()
      }
    })
  }
)

describe('duplicate answer completeness', () => {
  it('can use a complete server snapshot before the live fetch finishes', () => {
    const complete = { id: initial.id, answers }
    expect(
      hasAllAnswersForCopy(complete, complete, answers.length, false)
    ).toBe(true)
    expect(
      hasAllAnswersForCopy(
        complete,
        {
          ...complete,
          answers: [...answers, { id: 'new-answer', prob: 0.01 }],
        },
        answers.length,
        false
      )
    ).toBe(true)
  })

  it('rejects cached answers that reach the count but omit a server answer', () => {
    const complete = { id: initial.id, answers }
    const cached = {
      ...complete,
      answers: [...answers.slice(1), { id: 'different-answer', prob: 0.01 }],
    }
    expect(hasAllAnswersForCopy(complete, cached, answers.length, false)).toBe(
      false
    )
  })

  it('requires a full fetch when the server did not provide a count', () => {
    expect(hasAllAnswersForCopy(initial, initial, undefined, false)).toBe(false)
    expect(
      hasAllAnswersForCopy(initial, { ...initial, answers }, undefined, true)
    ).toBe(true)
  })

  it('accepts a full response even if answers were removed since the snapshot', () => {
    expect(hasAllAnswersForCopy(initial, initial, answers.length, true)).toBe(
      true
    )
  })

  it('does not copy the previous market while navigation changes the query', () => {
    expect(
      hasAllAnswersForCopy({ ...initial, id: 'next-market' }, initial, 20, true)
    ).toBe(false)
  })

  it('does not require an answer fetch for a market without answers', () => {
    const binary = { id: initial.id }
    expect(hasAllAnswersForCopy(binary, binary, undefined, false)).toBe(true)
  })
})
