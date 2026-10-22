import { models, resolveGeminiThinkingLevel } from './gemini'

describe('resolveGeminiThinkingLevel', () => {
  it('clamps minimal to low on Flash, which has no minimal level', () => {
    expect(resolveGeminiThinkingLevel(models.flash, 'minimal')).toBe('low')
  })

  it('passes minimal through on Flash-Lite', () => {
    expect(resolveGeminiThinkingLevel(models.flashLite, 'minimal')).toBe(
      'minimal'
    )
  })

  it.each(['low', 'medium', 'high'] as const)(
    'leaves %s unchanged on both tiers',
    (level) => {
      expect(resolveGeminiThinkingLevel(models.flash, level)).toBe(level)
      expect(resolveGeminiThinkingLevel(models.flashLite, level)).toBe(level)
    }
  )

  it('leaves an unset level unset so the model default applies', () => {
    expect(resolveGeminiThinkingLevel(models.flash, undefined)).toBeUndefined()
  })
})
