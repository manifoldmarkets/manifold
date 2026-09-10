import { Contract, MultiContract, PerpContract } from './contract'
import { getContractOGProps, getSeoDescription } from './contract-seo'

describe('perpetual market external metadata', () => {
  it('identifies a perp and formats its finite oracle price', () => {
    const contract = getPerpContract(42.125)

    expect(getContractOGProps(contract)).toEqual(
      expect.objectContaining({
        outcomeType: 'PERP',
        perpPrice: '42.125',
        probability: undefined,
        numericValue: undefined,
      })
    )
    expect(getSeoDescription(contract)).toBe(
      'Perpetual market. Oracle price: 42.125. Free to play with play money. Tracks the underlying asset.'
    )
  })

  it('describes a resolved perp using its immutable settlement price', () => {
    const contract = getPerpContract(42.125, {
      isResolved: true,
      resolution: 'MKT',
      resolvedOraclePrice: 41.5,
    })

    expect(getContractOGProps(contract)).toEqual(
      expect.objectContaining({ perpPrice: '41.500' })
    )
    expect(getSeoDescription(contract)).toBe(
      'Perpetual market settled at 41.500. Free to play with play money. Tracks the underlying asset.'
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'never serializes a non-finite oracle price (%s)',
    (oraclePrice) => {
      const contract = getPerpContract(oraclePrice, { resolution: 'MKT' })
      const ogProps = getContractOGProps(contract)
      const seoDescription = getSeoDescription(contract)

      expect(ogProps).toEqual(
        expect.objectContaining({
          outcomeType: 'PERP',
          probability: undefined,
          numericValue: undefined,
        })
      )
      expect(ogProps).not.toHaveProperty('perpPrice')
      expect(seoDescription).toBe(
        'Perpetual market. Free to play with play money. Tracks the underlying asset.'
      )
      expect(seoDescription).not.toMatch(/NaN|Infinity|chance|%/)
    }
  )

  it('preserves binary OG metadata', () => {
    const contract = getBinaryContract()

    expect(getContractOGProps(contract)).toEqual({
      v: '3',
      question: 'Will this happen?',
      numTraders: '7',
      volume: '1234',
      probability: '50%',
      creatorName: 'Test Creator',
      creatorAvatarUrl: undefined,
      numericValue: undefined,
      resolution: undefined,
      topAnswer: undefined,
      answers: undefined,
      bountyLeft: undefined,
    })
    expect(getSeoDescription(contract)).toBe(
      '50% chance. Free to play with play money. A binary market description.'
    )
  })
})

describe('multiple choice OG metadata', () => {
  it('lists the most likely answers first, capped at three', () => {
    const longText =
      'Charlie, whose answer text goes on for far longer than fits on a card'
    const contract = getMultiContract([
      ['Alpha', 0.2],
      ['Bravo', 0.5],
      [longText, 0.25],
      ['Delta', 0.05],
    ])

    const ogProps = getContractOGProps(contract)
    expect(ogProps.topAnswer).toBe('Bravo')
    expect(ogProps.probability).toBe('50%')
    expect(JSON.parse(ogProps.answers ?? '[]')).toEqual([
      { t: 'Bravo', p: '50%' },
      {
        t: 'Charlie, whose answer text goes on for far longer than fits…',
        p: '25%',
      },
      { t: 'Alpha', p: '20%' },
    ])
  })

  it('uses the resolution map for a market resolved to one answer', () => {
    // CHOOSE_ONE: resolution is the answer id, resolutions carries 100%, the
    // answers' probs are updated, but their pools are left as they were
    const contract = getMultiContract(
      [
        ['Alpha', 0.2],
        ['Bravo', 0.5],
        ['Charlie', 0.3],
      ],
      {
        isResolved: true,
        resolution: 'answer-0',
        resolutions: { 'answer-0': 100 },
      }
    )
    contract.answers[0].prob = 1
    contract.answers[1].prob = 0
    contract.answers[2].prob = 0

    const ogProps = getContractOGProps(contract)
    expect(ogProps.topAnswer).toBe('Alpha')
    expect(ogProps.probability).toBe('100%')
    expect(JSON.parse(ogProps.answers ?? '[]')).toEqual([
      { t: 'Alpha', p: '100%', w: true },
      { t: 'Bravo', p: '0%' },
      { t: 'Charlie', p: '0%' },
    ])
  })

  it('splits percentages across multiple winners', () => {
    const contract = getMultiContract(
      [
        ['Alpha', 0.2],
        ['Bravo', 0.5],
        ['Charlie', 0.3],
      ],
      {
        isResolved: true,
        resolution: 'CHOOSE_MULTIPLE',
        resolutions: { 'answer-1': 60, 'answer-2': 40 },
      }
    )
    contract.answers[0].prob = 0
    contract.answers[1].prob = 0.6
    contract.answers[2].prob = 0.4

    expect(JSON.parse(getContractOGProps(contract).answers ?? '[]')).toEqual([
      { t: 'Bravo', p: '60%', w: true },
      { t: 'Charlie', p: '40%', w: true },
      { t: 'Alpha', p: '0%' },
    ])
  })

  it('shows independent answers resolved on their own', () => {
    const contract = getMultiContract(
      [
        ['Alpha', 0.2],
        ['Bravo', 0.5],
        ['Charlie', 0.3],
      ],
      { shouldAnswersSumToOne: false }
    )
    Object.assign(contract.answers[0], { resolution: 'YES', prob: 1 })
    Object.assign(contract.answers[1], { resolution: 'NO', prob: 0 })

    const ogProps = getContractOGProps(contract)
    expect(JSON.parse(ogProps.answers ?? '[]')).toEqual([
      { t: 'Charlie', p: '30%' },
      { t: 'Alpha', p: '100%', w: true },
      { t: 'Bravo', p: '0%' },
    ])
  })

  it('omits answers for a canceled market so the card shows Canceled', () => {
    const contract = getMultiContract(
      [
        ['Alpha', 0.2],
        ['Bravo', 0.8],
      ],
      { isResolved: true, resolution: 'CANCEL' }
    )

    const ogProps = getContractOGProps(contract)
    expect(ogProps.answers).toBeUndefined()
    expect(ogProps.topAnswer).toBeUndefined()
    expect(ogProps.probability).toBeUndefined()
    expect(ogProps.resolution).toBe('CANCEL')
  })
})

function getMultiContract(
  answers: [text: string, prob: number][],
  overrides: Partial<MultiContract> = {}
) {
  return {
    question: 'Which one?',
    description: 'A multiple choice market.',
    creatorName: 'Test Creator',
    outcomeType: 'MULTIPLE_CHOICE',
    mechanism: 'cpmm-multi-1',
    shouldAnswersSumToOne: true,
    uniqueBettorCount: 3,
    volume: 100,
    answers: answers.map(([text, prob], index) => ({
      id: `answer-${index}`,
      index,
      text,
      prob,
      // cpmm probability with p = 0.5 is poolNo / (poolYes + poolNo)
      poolYes: 100 * (1 - prob),
      poolNo: 100 * prob,
    })),
    ...overrides,
  } as unknown as MultiContract
}

function getPerpContract(
  oraclePrice: number,
  overrides: Partial<PerpContract> = {}
): PerpContract {
  return {
    question: 'Underlying asset price',
    description: 'Tracks the underlying asset.',
    creatorName: 'Test Creator',
    outcomeType: 'PERP',
    oraclePrice,
    uniqueBettorCount: 12,
    volume: 9876.54,
    ...overrides,
  } as unknown as PerpContract
}

function getBinaryContract(): Contract {
  return {
    question: 'Will this happen?',
    description: 'A binary market description.',
    creatorName: 'Test Creator',
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    pool: { YES: 100, NO: 100 },
    p: 0.5,
    uniqueBettorCount: 7,
    volume: 1234.9,
  } as unknown as Contract
}
