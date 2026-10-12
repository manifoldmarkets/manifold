import { effortFromThinkingLevel } from './prompt-ai'

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
