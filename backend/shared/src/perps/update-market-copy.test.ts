import { API, ValidatedAPIParams } from 'common/api/schema'
import { PerpContract } from 'common/contract'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import { MNX_CREATOR_IDS } from 'common/perps/creator-accounts'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { recordContractEdit } from '../record-contract-edit'
import { updateContract } from '../supabase/contracts'
import { getContract } from '../utils'

// Exercise the API handler through the shared test runner, as the preflight
// tests exercise scripts. Request validation and permission checks are real;
// persistence, rich-text sanitizing, and the HTTP wrapper are mocked.
jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('../../../api/src/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('../analytics', () => ({ trackPublicEvent: jest.fn() }))
jest.mock('../audit-events', () => ({ trackAuditEvent: jest.fn() }))
jest.mock('../record-contract-edit', () => ({ recordContractEdit: jest.fn() }))
jest.mock('../supabase/contracts', () => ({ updateContract: jest.fn() }))
jest.mock('../utils', () => ({
  getContract: jest.fn(),
  sanitizeJsonContent: (content: unknown) => content,
  revalidateContractStaticProps: jest.fn(),
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('../supabase/init', () => ({
  createSupabaseDirectClient: () => ({}),
  pgp: jest.requireActual('pg-promise')(),
}))

const { updateMarket } = jest.requireActual(
  '../../../api/src/update-market'
) as {
  updateMarket: (
    body: ValidatedAPIParams<'market/:contractId/update'>,
    auth: { uid: string }
  ) => Promise<{ result: { success: boolean }; continue: () => Promise<void> }>
}
const mnxId = 'mnx-partner'
const description = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'MNX mark price.' }] },
  ],
}
const ids = { ...MNX_CREATOR_IDS }
let contract: PerpContract

beforeEach(() => {
  jest.clearAllMocks()
  MNX_CREATOR_IDS[ENV] = mnxId
  contract = {
    id: 'mnx-market',
    creatorId: mnxId,
    creatorUsername: 'RenamedPartner',
    mechanism: 'perp',
    outcomeType: 'PERP',
    oracleFeedId: MNX_INSTRUMENTS[0].feedId,
    ticker: MNX_INSTRUMENTS[0].symbol,
    question: MNX_INSTRUMENTS[0].question,
  } as PerpContract
  jest.mocked(getContract).mockImplementation(async () => contract)
})
afterEach(() => Object.assign(MNX_CREATOR_IDS, ids))

const edit = async (
  fields: Omit<ValidatedAPIParams<'market/:contractId/update'>, 'contractId'>,
  userId = mnxId
) =>
  updateMarket(
    API['market/:contractId/update'].props.parse({
      contractId: contract.id,
      ...fields,
    }),
    { uid: userId }
  )

it('lets the pinned MNX owner edit title and description and records both edits', async () => {
  const result = await edit({
    question: 'Anthropic valuation',
    descriptionJson: JSON.stringify(description),
  })
  expect(result.result.success).toBe(true)
  expect(updateContract).toHaveBeenCalledWith(
    {},
    contract.id,
    expect.objectContaining({
      question: 'Anthropic valuation',
      description,
    })
  )
  const patch = jest.mocked(updateContract).mock.calls[0][2]
  expect(patch).not.toHaveProperty('oracleFeedId')
  expect(patch).not.toHaveProperty('ticker')
  await result.continue()
  expect(recordContractEdit).toHaveBeenCalledWith(contract, mnxId, [
    'question',
    'description',
  ])
})

it('retains description-only editing through the existing creator API', async () => {
  await edit({ descriptionJson: JSON.stringify(description) })
  expect(updateContract).toHaveBeenCalledWith(
    {},
    contract.id,
    expect.objectContaining({ description })
  )
})

it('lets an admin edit the display title of an MNX-owned market', async () => {
  await expect(
    edit({ question: 'Partner title' }, ENV_CONFIG.adminIds[0])
  ).resolves.toMatchObject({ result: { success: true } })
})

it.each([
  { question: 'Unauthorized title' },
  { descriptionJson: JSON.stringify(description) },
])('refuses another user editing MNX copy: %j', async (fields) => {
  await expect(edit(fields, 'someone-else')).rejects.toThrow('admin or mod')
  expect(updateContract).not.toHaveBeenCalled()
})

it('does not grant MNX access to another owner’s market', async () => {
  contract.creatorId = 'another-owner'
  await expect(edit({ question: 'New title' })).rejects.toThrow('admin or mod')
  expect(updateContract).not.toHaveBeenCalled()
})

it.each([
  { creatorId: 'house', oracleFeedId: MNX_INSTRUMENTS[0].feedId },
  { creatorId: mnxId, oracleFeedId: 'btc-usd' },
])(
  'retains canonical titles outside MNX-owned MNX feeds: %j',
  async (fields) => {
    Object.assign(contract, fields)
    await expect(
      edit({ question: 'New title' }, ENV_CONFIG.adminIds[0])
    ).rejects.toThrow('The launch title')
    expect(updateContract).not.toHaveBeenCalled()
  }
)

it('does not grant title exceptions when the partner is unconfigured', async () => {
  MNX_CREATOR_IDS[ENV] = undefined
  await expect(edit({ question: 'New title' })).rejects.toThrow(
    'The launch title'
  )
  expect(updateContract).not.toHaveBeenCalled()
})

it('still refuses ticker changes by MNX', async () => {
  await expect(edit({ ticker: 'NEW' })).rejects.toThrow('Only admins')
  expect(updateContract).not.toHaveBeenCalled()
})

it('still rejects attempts to retarget the oracle feed', async () => {
  await expect(edit({ oracleFeedId: 'btc-usd' } as never)).rejects.toThrow()
  expect(updateContract).not.toHaveBeenCalled()
})
