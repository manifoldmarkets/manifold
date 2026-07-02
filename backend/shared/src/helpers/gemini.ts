import { GoogleGenAI } from '@google/genai'
import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'

export const models = {
  flashLite: 'gemini-3.1-flash-lite' as const,
  flash: 'gemini-3.5-flash' as const,
  pro: 'gemini-3.1-pro-preview' as const,
}

export type model_types = (typeof models)[keyof typeof models]

// Thinking levels for Gemini 3 models
// 'minimal' and 'medium' are only supported by Gemini 3 Flash
// Default is 'high' when not specified
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

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
  if (thinkingLevel) {
    config.thinkingConfig = { thinkingLevel }
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
