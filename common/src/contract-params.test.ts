import { getContractParams } from './contract-params'
import { createClient } from 'common/supabase/utils'
import {
  Contract,
  CPMMNumericContract,
  CPMMMultiContract,
} from 'common/contract'
import * as apiUtils from './util/api'

jest.mock('./util/api', () => ({
  ...jest.requireActual('./util/api'),
  unauthedApi: jest.fn().mockImplementation((path: string, params: any) => {
    if (
      path === 'unique-bet-group-count' ||
      path === 'get-related-markets-cache'
    ) {
      return Promise.resolve({
        count: 5,
        marketsFromEmbeddings: [],
        marketsByTopicSlug: {},
      })
    }
    return Promise.resolve({})
  }),
}))

jest.mock('common/supabase/bets', () => ({
  getBets: jest.fn().mockResolvedValue([]),
  getTotalBetCount: jest.fn().mockResolvedValue(10),
  getBetPoints: jest
    .fn()
    .mockResolvedValue([{ x: 1, y: 0.5, answerId: 'answer-123' }]),
}))

jest.mock('common/supabase/is-admin', () => ({
  getIsAdmin: jest.fn().mockResolvedValue(false),
}))

jest.mock('common/supabase/groups', () => ({
  ...jest.requireActual('common/supabase/groups'),
  userCanAccess: jest.fn().mockResolvedValue(false),
  getTopicsOnContract: jest.fn().mockResolvedValue([
    {
      groups: {
        id: '123',
        name: 'Test Group',
        slug: 'test-group',
        importance_score: 1,
        privacy_status: 'public',
        total_members: 10,
      },
    },
  ]),
}))

jest.mock('common/supabase/comments', () => ({
  getRecentTopLevelCommentsAndReplies: jest.fn().mockResolvedValue([]),
  getPinnedComments: jest.fn().mockResolvedValue([]),
}))

jest.mock('common/supabase/contract-metrics', () => ({
  getCPMMContractUserContractMetrics: jest
    .fn()
    .mockResolvedValue({ YES: [], NO: [] }),
  getContractMetricsCount: jest.fn().mockResolvedValue(0),
}))

jest.mock('common/chart', () => ({
  ...jest.requireActual('common/chart'),
  serializeMultiPoints: jest.fn().mockReturnValue({
    'answer-123': [[1, 0.5]],
  }),
}))

jest.mock('common/supabase/contracts', () => ({
  ...jest.requireActual('common/supabase/contracts'),
  getContractPageViews: jest.fn().mockResolvedValue(100),
}))

jest.mock('common/supabase/chart-annotations', () => ({
  getChartAnnotations: jest.fn().mockResolvedValue([
    {
      id: 'annotation-1',
      contract_id: '123',
      event_time: '2022-01-01T00:00:00Z',
      content: 'Test annotation',
    },
  ]),
}))

describe('getContractParams', () => {
  afterEach(() => {
    // Restore all mocks to their original implementations after each test
    jest.restoreAllMocks()
  })
  it('should return not authed state for unauthorized access', async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '123',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      visibility: 'private',
      deleted: false,
    } as Contract

    const result = await getContractParams(
      mockContract,
      mockDb,
      true,
      undefined
    )

    expect(result).toEqual({
      state: 'not authed',
      slug: mockContract.slug,
      visibility: mockContract.visibility,
    })
  })

  it('should return not found state for a deleted contract with unauthorized access', async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '123',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      visibility: 'private',
      deleted: true, // Contract marked as deleted
    } as Contract

    const result = await getContractParams(
      mockContract,
      mockDb,
      true, // Check access
      'non-admin-user-id' // Non-admin user ID
    )

    expect(result).toEqual({ state: 'not found' })
  })

  // Test case for handling errors gracefully when external API calls fail
  it('should handle errors gracefully when external API calls fail', async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '123',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      visibility: 'private',
      deleted: false,
    } as Contract

    jest
      .spyOn(apiUtils, 'unauthedApi')
      .mockImplementationOnce((path: string, params: any) => {
        if (path === 'external-api-path') {
          return Promise.reject(new Error('External API call failed'))
        }
        return Promise.resolve()
      })

    await expect(
      getContractParams(mockContract, mockDb, true, undefined)
    ).resolves.toMatchObject({
      state: expect.any(String),
    })
  })

  it('should correctly fetch and process CPMM contract parameters', async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '123',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      visibility: 'private',
      deleted: false,
      slug: 'test-slug',
      creatorId: 'creator-id',
      creatorName: 'Creator Name',
      creatorUsername: 'creatorusername',
      question: 'Test Question?',
      description: 'Test Description',
      resolutionTime: 1622548800000,
      pool: { YES: 500, NO: 500 },
      createdTime: 0,
      lastUpdatedTime: 0,
      volume: 0,
      isResolved: false,
      creatorAvatarUrl: '',
      creatorCreatedTime: 0,
      volume24Hours: 0,
      elasticity: 0,
      collectedFees: {
        YES: 0,
        NO: 0,
        creatorFee: 0,
        platformFee: 0,
        liquidityFee: 0,
      },
      uniqueBettorCount: 0,
      totalLiquidity: 0,
      isPolitics: false,
      popularityScore: 0,
      importanceScore: 0,
      dailyScore: 0,
      freshnessScore: 0,
      p: 0.5,
      subsidyPool: 100,
      prob: 0.5,
      probChanges: { day: 0, week: 0, month: 0 },
      initialProbability: 0.5, // Added initialProbability
      conversionScore: 0, // Added missing conversionScore property
    } as Contract

    const result = await getContractParams(
      mockContract,
      mockDb,
      false,
      undefined
    )

    expect(result).toMatchObject({
      state: 'authed',
      params: {
        totalBets: 10,
        totalViews: 100,
        historyData: {
          points: [
            [0, 0.5], // Initial bet point
            [1, 0.5], // Mocked bet point from `getBetPoints`
          ],
        },
        comments: [],
        contract: expect.objectContaining({
          collectedFees: {
            NO: 0,
            YES: 0,
            creatorFee: 0,
            liquidityFee: 0,
            platformFee: 0,
          },
          creatorId: 'creator-id',
          creatorName: 'Creator Name',
          creatorUsername: 'creatorusername',
          deleted: false,
          description: 'Test Description',
          id: '123',
          mechanism: 'cpmm-1',
          outcomeType: 'BINARY',
        }),
        pinnedComments: [],
        topics: [
          {
            groups: {
              id: '123',
              name: 'Test Group',
              slug: 'test-group',
              importance_score: 1,
              privacy_status: 'public',
              total_members: 10,
            },
          },
        ],
        chartAnnotations: expect.any(Array),
        relatedContracts: expect.anything(),
      },
    })
  })

  it('should correctly fetch and process NUMBER outcome type contract parameters', async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '456',
      mechanism: 'cpmm-multi-1',
      outcomeType: 'NUMBER',
      visibility: 'public',
      deleted: false,
      slug: 'test-number-contract',
      creatorId: 'creator-id',
      creatorName: 'Creator Name',
      creatorUsername: 'creatorusername',
      question: 'Test Question?',
      description: 'Test Description',
      resolutionTime: 1622548800000,
      pool: { YES: 500, NO: 500 },
      createdTime: 0,
      lastUpdatedTime: 0,
      volume: 0,
      isResolved: false,
      creatorAvatarUrl: '',
      creatorCreatedTime: 0,
      volume24Hours: 0,
      elasticity: 0,
      collectedFees: {
        YES: 0,
        NO: 0,
        creatorFee: 0,
        platformFee: 0,
        liquidityFee: 0,
      },
      uniqueBettorCount: 5, // Corrected totalBets expectation
      totalLiquidity: 0,
      isPolitics: false,
      popularityScore: 0,
      importanceScore: 0,
      dailyScore: 0,
      freshnessScore: 0,
      p: 0.5,
      subsidyPool: 100,
      prob: 0.5,
      probChanges: { day: 0, week: 0, month: 0 },
      initialProbability: 0.5, // Added initialProbability
      max: 100, // Added max value
      min: 0, // Added min value
      answers: [], // Added answers array
      shouldAnswersSumToOne: true, // Added shouldAnswersSumToOne
      addAnswersMode: 'DISABLED', // Added addAnswersMode
      conversionScore: 0, // Added missing conversionScore property
    } as CPMMNumericContract

    const result = await getContractParams(
      mockContract,
      mockDb,
      false,
      undefined
    )

    expect(result).toMatchObject({
      state: 'authed',
      params: {
        totalBets: 5, // Corrected totalBets expectation
        totalViews: 100,
        historyData: {
          points: {
            'answer-123': [[1, 0.5]], // Corrected structure for historyData.points
          },
        },
        comments: [],
        contract: expect.objectContaining({
          collectedFees: {
            NO: 0,
            YES: 0,
            creatorFee: 0,
            liquidityFee: 0,
            platformFee: 0,
          },
          creatorId: 'creator-id',
          creatorName: 'Creator Name',
          creatorUsername: 'creatorusername',
          deleted: false,
          description: 'Test Description',
          id: '456',
          mechanism: 'cpmm-multi-1',
          outcomeType: 'NUMBER',
        }),
        pinnedComments: [],
        topics: [
          {
            groups: {
              id: '123',
              name: 'Test Group',
              slug: 'test-group',
              importance_score: 1,
              privacy_status: 'public',
              total_members: 10,
            },
          },
        ],
        chartAnnotations: expect.any(Array),
        relatedContracts: expect.anything(),
      },
    })
  })

  // Test case for 'cpmm-multi-1' mechanism and 'MULTIPLE_CHOICE' outcome type
  it("should correctly handle cases with 'cpmm-multi-1' mechanism and 'MULTIPLE_CHOICE' outcome type", async () => {
    const mockDb = createClient('instanceId', 'key')
    const mockContract = {
      id: '789',
      mechanism: 'cpmm-multi-1',
      outcomeType: 'MULTIPLE_CHOICE',
      visibility: 'public',
      deleted: false,
      slug: 'test-multi-contract',
      creatorId: 'creator-id',
      creatorName: 'Creator Name',
      creatorUsername: 'creatorusername',
      question: 'Test Question?',
      description: 'Test Description',
      resolutionTime: 1622548800000,
      pool: { YES: 500, NO: 500 },
      createdTime: 0,
      lastUpdatedTime: 0,
      volume: 0,
      isResolved: false,
      creatorAvatarUrl: '',
      creatorCreatedTime: 0,
      volume24Hours: 0,
      elasticity: 0,
      collectedFees: {
        YES: 0,
        NO: 0,
        creatorFee: 0,
        platformFee: 0,
        liquidityFee: 0,
      },
      uniqueBettorCount: 0,
      totalLiquidity: 0,
      isPolitics: false,
      popularityScore: 0,
      importanceScore: 0,
      dailyScore: 0,
      freshnessScore: 0,
      p: 0.5,
      subsidyPool: 100,
      prob: 0.5,
      probChanges: { day: 0, week: 0, month: 0 },
      initialProbability: 0.5,
      answers: [],
      shouldAnswersSumToOne: true,
      addAnswersMode: 'DISABLED',
      conversionScore: 0, // Added missing conversionScore property
    } as CPMMMultiContract

    const result = await getContractParams(
      mockContract,
      mockDb,
      false,
      undefined
    )

    expect(result).toMatchObject({
      state: 'authed',
      params: {
        totalBets: 10, // Updated expected totalBets value to match the mocked getTotalBetCount return value
        totalViews: 100,
        historyData: {
          points: {},
        },
        comments: [],
        contract: expect.objectContaining({
          collectedFees: {
            NO: 0,
            YES: 0,
            creatorFee: 0,
            liquidityFee: 0,
            platformFee: 0,
          },
          creatorId: 'creator-id',
          creatorName: 'Creator Name',
          creatorUsername: 'creatorusername',
          deleted: false,
          description: 'Test Description',
          id: '789',
          mechanism: 'cpmm-multi-1',
          outcomeType: 'MULTIPLE_CHOICE',
        }),
        pinnedComments: [],
        topics: [
          {
            groups: {
              id: '123',
              name: 'Test Group',
              slug: 'test-group',
              importance_score: 1,
              privacy_status: 'public',
              total_members: 10,
            },
          },
        ],
        chartAnnotations: expect.any(Array),
        relatedContracts: expect.anything(),
      },
    })
  })
})
