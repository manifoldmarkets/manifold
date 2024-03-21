import { getContracts, getContractsByUsers, getAnswersForContracts, getContractFromSlug } from './contracts'
import { createClient } from '@supabase/supabase-js'

describe('getContracts', () => {
  it('should return an empty array when no contract IDs are provided', async () => {
    // Mock SupabaseClient with necessary arguments
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const contractIds: string[] = []
    const result = await getContracts(contractIds, db)
    expect(result).toEqual([])
  })

  it('should correctly return contracts for provided IDs', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const contractIds = ['contract1', 'contract2']
    db.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ data: { id: 'contract1', name: 'Contract 1' } }, { data: { id: 'contract2', name: 'Contract 2' } }]
      })
    })

    const result = await getContracts(contractIds, db)
    expect(result).toHaveLength(2)
    expect(result).toEqual([
      { id: 'contract1', name: 'Contract 1' },
      { id: 'contract2', name: 'Contract 2' }
    ])
  })

  it('should correctly handle chunking and return combined results for getContracts with more than 300 IDs', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const contractIds = Array.from({ length: 301 }, (_, i) => `contract${i + 1}`)
    db.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockImplementation((_, chunk) => Promise.resolve({
        data: chunk.map((id: string) => ({ data: { id, name: `Name for ${id}` } }))
      }))
    })

    const result = await getContracts(contractIds, db)
    expect(result).toHaveLength(301)
    expect(result[0]).toEqual({ id: 'contract1', name: 'Name for contract1' })
    expect(result[300]).toEqual({ id: 'contract301', name: 'Name for contract301' })
  })

  it('should handle errors gracefully when database operations fail', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const contractIds = ['contract1', 'contract2']
    db.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockRejectedValue(new Error('Database operation failed'))
    })

    await expect(getContracts(contractIds, db)).rejects.toThrow('Database operation failed')
  })
})

describe('getContractsByUsers', () => {
  it('should return contracts grouped by user IDs correctly', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const userIds = ['user1', 'user2']
    db.rpc = jest.fn().mockResolvedValue({
      data: [
        { creator_id: 'user1', contracts: [{ id: 'contract1', name: 'Contract 1' }] },
        { creator_id: 'user2', contracts: [{ id: 'contract2', name: 'Contract 2' }] }
      ]
    })

    const result = await getContractsByUsers(userIds, db)
    expect(result).toEqual({
      'user1': [
        { id: 'contract1', name: 'Contract 1' }
      ],
      'user2': [
        { id: 'contract2', name: 'Contract 2' }
      ]
    })
  })
})

describe('getAnswersForContracts', () => {
  it('should group answers by contract ID', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    const contractIds = ['contract1', 'contract2']
    // Mocking the database response
    db.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [
          { id: 'answer1', contractId: 'contract1', index: 1 },
          { id: 'answer2', contractId: 'contract2', index: 2 },
          { id: 'answer3', contractId: 'contract1', index: 3 }
        ]
      })
    })

    const result = await getAnswersForContracts(db, contractIds)
    expect(result).toEqual({
      'contract1': [
        { id: 'answer1', contractId: 'contract1', index: 1 },
        { id: 'answer3', contractId: 'contract1', index: 3 }
      ],
      'contract2': [
        { id: 'answer2', contractId: 'contract2', index: 2 }
      ]
    })
  })
})

describe('getContractFromSlug', () => {
  it('should return null when no contract matches the slug', async () => {
    const db = createClient('https://your-project.supabase.co', 'public-anon-key')
    // Mocking the database response
    db.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [] // Simulating no matching contract
      })
    })

    const contractSlug = 'non-existent-slug'
    const result = await getContractFromSlug(contractSlug, db)
    expect(result).toBeNull()
  })
})