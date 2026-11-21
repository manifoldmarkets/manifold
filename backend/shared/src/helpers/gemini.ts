import { GoogleGenAI } from '@google/genai'
import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'

// Two tiers, cheapest first. Paid-tier prices per 1M tokens as of Oct 2026
// (https://ai.google.dev/gemini-api/docs/pricing):
//   flashLite  gemini-3.5-flash-lite  $0.30 in / $2.50 out
//              yes/no checks, ID lists, short JSON — the bulk of our calls
//   flash      gemini-3.8-flash       $0.75 / $3.75 until 2026-12-31, then $1.50 / $7.50
//              grounded (Google Search) generation and the clarification check
//
// gemini-3.1-flash-lite retires 2027-05-07 (Google names 3.5 Flash-Lite as the
// replacement). gemini-3.5-flash is superseded by 3.8 Flash, which Google says
// to prefer for capacity; 3.5 Flash was returning "high demand" 503s in prod.
export const models = {
  flashLite: 'gemini-3.5-flash-lite' as const,
  flash: 'gemini-3.8-flash' as const,
}

export type model_types = (typeof models)[keyof typeof models]

// Thinking levels for Gemini 3 models (https://ai.google.dev/gemini-api/docs/thinking).
// Defaults when unspecified: flash -> 'medium', flashLite -> 'minimal'.
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

// 3.8 Flash accepts only low / medium / high; 'minimal' is a Flash-Lite level
// (3.5 Flash supported it, 3.8 rejects it with a 400). Clamp instead of
// failing so call sites can ask for the cheapest level without knowing which
// Gemini model the tier currently points at.
export const resolveGeminiThinkingLevel = (
  model: model_types,
  level: GeminiThinkingLevel | undefined
): GeminiThinkingLevel | undefined => {
  if (level === 'minimal' && model === models.flash) return 'low'
  return level
}

export type GeminiOptions = {
  system?: string
  model?: model_types
  webSearch?: boolean
  thinkingLevel?: GeminiThinkingLevel
}

export const promptGeminiParsingJson = async <T>(
  prompt: string,
  options: GeminiOptions = {}
): Promise<T> => {
  const response = await promptGemini(prompt, options)
  return parseAIResponseAsJson(response)
}

export const promptGemini = async (
  prompt: string,
  options: GeminiOptions = {}
) => {
  const {
    model = models.flash,
    system,
    webSearch = false,
    thinkingLevel,
  } = options

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new APIError(500, 'Missing GEMINI_API_KEY')
  }

  const ai = new GoogleGenAI({ apiKey })

  const config: Record<string, any> = {}
  if (system) {
    config.systemInstruction = system
  }
  if (webSearch) {
    config.tools = [{ googleSearch: {} }]
  }
  const resolvedThinkingLevel = resolveGeminiThinkingLevel(model, thinkingLevel)
  if (resolvedThinkingLevel) {
    config.thinkingConfig = { thinkingLevel: resolvedThinkingLevel }
  }

  try {
    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    })

    const response = result.text ?? ''
    log('Gemini returned message:', response)
    return response
  } catch (error: any) {
    log.error(`Error with Gemini API: ${error.message}`)
    throw new APIError(500, 'Failed to get response from Gemini')
  }
}

// Helper function to clean Gemini responses from markdown formatting
const removeJsonTicksFromAIResponse = (response: string): string => {
  // Remove markdown code block formatting if present
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/
  const match = response.match(jsonBlockRegex)

  if (match && match[1]) {
    return match[1].trim()
  }

  // If no markdown formatting found, return the original response
  return response.trim()
}

// Helper function to ensure the response is valid JSON
export const parseAIResponseAsJson = (response: string): any => {
  const cleanedResponse = removeJsonTicksFromAIResponse(response)

  try {
    // Try to parse as is
    return JSON.parse(cleanedResponse)
  } catch (error) {
    // If parsing fails, try to handle common issues

    // Check if it's an array wrapped in extra text
    const arrayStart = cleanedResponse.indexOf('[')
    const arrayEnd = cleanedResponse.lastIndexOf(']')

    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      const potentialArray = cleanedResponse.substring(arrayStart, arrayEnd + 1)
      try {
        return JSON.parse(potentialArray)
      } catch (_e) {
        // If still fails, throw the original error
        throw error
      }
    }

    // If we can't fix it, throw the original error
    throw error
  }
}
