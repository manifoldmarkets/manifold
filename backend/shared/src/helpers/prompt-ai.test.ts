jest.mock('shared/utils', () => ({ log: { error: jest.fn() } }))
jest.mock('./claude', () => ({
  ...jest.requireActual('./claude'),
  promptClaude: jest.fn(),
}))
jest.mock('./gemini', () => ({
  ...jest.requireActual('./gemini'),
  promptGemini: jest.fn(),
}))
jest.mock('./openai-utils', () => ({
  models: { gpt: 'gpt-6-sol', gptMini: 'gpt-6-luna' },
  promptOpenAI: jest.fn(),
}))

import { promptClaude } from './claude'
import { promptGemini } from './gemini'
import { aiModels, effortFromThinkingLevel, promptAI } from './prompt-ai'

describe('effortFromThinkingLevel', () => {
  it('maps the Gemini-only minimal level to the lowest Claude effort', () => {
    expect(effortFromThinkingLevel('minimal')).toBe('low')
  })

  it.each(['low', 'medium', 'high'] as const)('passes %s through', (level) => {
    expect(effortFromThinkingLevel(level)).toBe(level)
  })

  it('leaves an unset level unset so the model default applies', () => {
    expect(effortFromThinkingLevel(undefined)).toBeUndefined()
  })
})

describe('Claude fallback', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(promptGemini).mockResolvedValue('["fallback"]')
  })

  it('returns valid Claude JSON without making a second paid request', async () => {
    jest.mocked(promptClaude).mockResolvedValue('```json\n["primary"]\n```')
    await expect(
      promptAI('classify', { model: aiModels.haiku, parseAsJson: true })
    ).resolves.toEqual(['primary'])
    expect(promptGemini).not.toHaveBeenCalled()
  })

  it('falls back when Claude returns malformed JSON', async () => {
    jest.mocked(promptClaude).mockResolvedValue('["incomplete"')
    await expect(
      promptAI('classify', { model: aiModels.haiku, parseAsJson: true })
    ).resolves.toEqual(['fallback'])
    expect(promptGemini).toHaveBeenCalledTimes(1)
  })

  it('preserves system, search and thinking options on a failed attempt', async () => {
    jest.mocked(promptClaude).mockRejectedValue(new Error('rate limited'))
    await promptAI('classify', {
      model: aiModels.haiku,
      system: 'instructions',
      webSearch: true,
      thinkingLevel: 'minimal',
      parseAsJson: true,
    })
    expect(promptClaude).toHaveBeenCalledWith('classify', {
      model: aiModels.haiku,
      system: 'instructions',
      webSearch: true,
      effort: 'low',
    })
    expect(promptGemini).toHaveBeenCalledWith('classify', {
      model: aiModels.flashLite,
      system: 'instructions',
      webSearch: true,
      thinkingLevel: 'minimal',
    })
  })

  it('maps explicit reasoning effort for both providers', async () => {
    jest.mocked(promptClaude).mockRejectedValue(new Error('unavailable'))
    await promptAI('classify', {
      model: aiModels.haiku,
      reasoning: { effort: 'high' },
    })
    expect(promptClaude).toHaveBeenCalledWith(
      'classify',
      expect.objectContaining({ effort: 'high' })
    )
    expect(promptGemini).toHaveBeenCalledWith(
      'classify',
      expect.objectContaining({ thinkingLevel: 'high' })
    )
  })

  it('preserves string responses', async () => {
    jest.mocked(promptClaude).mockResolvedValue('yes')
    await expect(promptAI('classify', { model: aiModels.haiku })).resolves.toBe(
      'yes'
    )
    expect(promptGemini).not.toHaveBeenCalled()
  })

  it('surfaces failure of both providers without retrying again', async () => {
    jest.mocked(promptClaude).mockRejectedValue(new Error('unavailable'))
    jest
      .mocked(promptGemini)
      .mockRejectedValue(new Error('fallback unavailable'))
    await expect(
      promptAI('classify', { model: aiModels.haiku })
    ).rejects.toThrow('fallback unavailable')
    expect(promptClaude).toHaveBeenCalledTimes(1)
    expect(promptGemini).toHaveBeenCalledTimes(1)
  })

  it('does not turn an invalid fallback response into success', async () => {
    jest.mocked(promptClaude).mockResolvedValue('invalid')
    jest.mocked(promptGemini).mockResolvedValue('also invalid')
    await expect(
      promptAI('classify', { model: aiModels.haiku, parseAsJson: true })
    ).rejects.toThrow()
    expect(promptGemini).toHaveBeenCalledTimes(1)
  })
})
