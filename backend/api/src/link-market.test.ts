jest.mock('./helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, f: unknown) => f,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => ({})),
}))
jest.mock('shared/utils', () => ({ getContract: jest.fn() }))
jest.mock('shared/supabase/market-links', () => ({
  deleteMarketLink: jest.fn(),
  getLinkedChildCount: jest.fn(),
  getLinkParentCandidate: jest.fn(),
  getMarketLinkParent: jest.fn(),
  upsertMarketLink: jest.fn(),
}))
jest.mock('common/envs/constants', () => ({
  ...jest.requireActual('common/envs/constants'),
  isModId: (id: string) => id === 'mod',
  isAdminId: () => false,
}))

import { getContract } from 'shared/utils'
import {
  deleteMarketLink,
  getLinkedChildCount,
  getLinkParentCandidate,
  getMarketLinkParent,
  upsertMarketLink,
} from 'shared/supabase/market-links'
import { linkMarket, unlinkMarket } from './link-market'

type Handler = (props: unknown, auth: { uid: string }) => Promise<unknown>
const link = linkMarket as unknown as Handler
const unlink = unlinkMarket as unknown as Handler

const contracts: Record<string, { creatorId: string; visibility: string }> = {
  prop: { creatorId: 'alice', visibility: 'public' },
  game: { creatorId: 'sports', visibility: 'public' },
}
const openParent = {
  id: 'game',
  visibility: 'public',
  deleted: false,
  isResolved: false,
  closeTime: Date.now() + 60 * 60 * 1000,
  isChild: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest
    .mocked(getContract)
    .mockImplementation(async (_pg, id) => contracts[id] as any)
  jest.mocked(getLinkedChildCount).mockResolvedValue(0)
  jest.mocked(getLinkParentCandidate).mockResolvedValue(openParent)
})

describe('link-market', () => {
  const props = { contractId: 'prop', parentContractId: 'game' }

  it("links the creator's market to the market it's about", async () => {
    await expect(link(props, { uid: 'alice' })).resolves.toEqual({
      success: true,
    })
    expect(upsertMarketLink).toHaveBeenCalledWith(expect.anything(), {
      childId: 'prop',
      parentId: 'game',
      relation: 'related',
      createdBy: 'alice',
    })
  })

  it('lets a mod fix a link', async () => {
    await link({ ...props, relation: 'prop' }, { uid: 'mod' })
    expect(upsertMarketLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ relation: 'prop', createdBy: 'mod' })
    )
  })

  it("refuses anyone else, so nobody can move another person's market", async () => {
    await expect(link(props, { uid: 'mallory' })).rejects.toMatchObject({
      code: 403,
    })
    expect(upsertMarketLink).not.toHaveBeenCalled()
  })

  it('refuses a parent that is itself linked, which would make a chain', async () => {
    jest
      .mocked(getLinkParentCandidate)
      .mockResolvedValue({ ...openParent, isChild: true })
    await expect(link(props, { uid: 'alice' })).rejects.toMatchObject({
      code: 400,
    })
    expect(upsertMarketLink).not.toHaveBeenCalled()
  })

  it('refuses to link a market that others are linked to', async () => {
    jest.mocked(getLinkedChildCount).mockResolvedValue(1)
    await expect(link(props, { uid: 'alice' })).rejects.toMatchObject({
      code: 400,
    })
    expect(upsertMarketLink).not.toHaveBeenCalled()
  })
})

describe('unlink-market', () => {
  beforeEach(() => {
    jest.mocked(getMarketLinkParent).mockResolvedValue({
      parent_contract_id: 'game',
      relation: 'prop',
    })
  })

  it.each([
    ["the market's creator", 'alice'],
    ["the linked market's creator", 'sports'],
    ['a mod', 'mod'],
  ])('lets %s unlink', async (_, uid) => {
    await expect(unlink({ contractId: 'prop' }, { uid })).resolves.toEqual({
      success: true,
    })
    expect(deleteMarketLink).toHaveBeenCalledWith(expect.anything(), 'prop')
  })

  it('refuses anyone else', async () => {
    await expect(
      unlink({ contractId: 'prop' }, { uid: 'mallory' })
    ).rejects.toMatchObject({ code: 403 })
    expect(deleteMarketLink).not.toHaveBeenCalled()
  })

  it('does nothing for a market with no link', async () => {
    jest.mocked(getMarketLinkParent).mockResolvedValue(null)
    await expect(
      unlink({ contractId: 'prop' }, { uid: 'mallory' })
    ).resolves.toEqual({ success: true })
    expect(deleteMarketLink).not.toHaveBeenCalled()
  })
})
