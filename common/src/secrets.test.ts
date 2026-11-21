const accessSecretVersion = jest.fn()

jest.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    getProjectId: async () => 'project',
    projectPath: (id: string) => `projects/${id}`,
    accessSecretVersion,
  })),
}))

import { getSecrets } from './secrets'

const found = (value: string) => [{ payload: { data: Buffer.from(value) } }]
const notFound = () => Object.assign(new Error('NOT_FOUND'), { code: 5 })
const secretOf = (request: { name: string }) =>
  request.name.split('/secrets/')[1].split('/')[0]

beforeEach(() => {
  accessSecretVersion.mockReset()
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('getSecrets', () => {
  it('leaves a missing optional secret unset instead of failing', async () => {
    accessSecretVersion.mockImplementation(async (request) =>
      secretOf(request) === 'THE_ODDS_API_KEY'
        ? Promise.reject(notFound())
        : found(`value-of-${secretOf(request)}`)
    )
    const result = await getSecrets(undefined, 'API_SECRET', 'THE_ODDS_API_KEY')
    expect(result).toEqual({ API_SECRET: 'value-of-API_SECRET' })
  })

  it('still fails when a required secret is missing', async () => {
    accessSecretVersion.mockImplementation(async (request) =>
      secretOf(request) === 'API_SECRET'
        ? Promise.reject(notFound())
        : found('value')
    )
    await expect(
      getSecrets(undefined, 'API_SECRET', 'THE_ODDS_API_KEY')
    ).rejects.toThrow('NOT_FOUND')
  })

  it('still fails when an optional secret errors for another reason', async () => {
    accessSecretVersion.mockRejectedValue(
      Object.assign(new Error('PERMISSION_DENIED'), { code: 7 })
    )
    await expect(getSecrets(undefined, 'THE_ODDS_API_KEY')).rejects.toThrow(
      'PERMISSION_DENIED'
    )
  })
})
