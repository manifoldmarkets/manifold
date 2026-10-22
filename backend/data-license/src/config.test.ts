import { loadConfig } from './config'

const POLICY = [
  'BARE_USERNAME_REWRITE',
  'BLANK_MODERATED_COMMENTS',
  'SCRUB_DESCRIPTIONS',
]

describe('redaction policy flags', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.CLIENT_ID = 'test-client'
    process.env.EXPORT_SALT = 'test-only-salt'
    for (const k of POLICY) delete process.env[k]
  })
  afterAll(() => {
    process.env = saved
  })

  test('all on by default', async () => {
    const cfg = await loadConfig()
    expect(cfg.bareUsernameRewrite).toBe(true)
    expect(cfg.blankModeratedComments).toBe(true)
    expect(cfg.scrubDescriptions).toBe(true)
  })

  test('each can be turned off', async () => {
    for (const k of POLICY) process.env[k] = 'false'
    const cfg = await loadConfig()
    expect(cfg.bareUsernameRewrite).toBe(false)
    expect(cfg.blankModeratedComments).toBe(false)
    expect(cfg.scrubDescriptions).toBe(false)
  })

  test('anything but true/false is rejected', async () => {
    process.env.SCRUB_DESCRIPTIONS = 'yes'
    await expect(loadConfig()).rejects.toThrow(
      'SCRUB_DESCRIPTIONS must be true or false'
    )
  })
})
