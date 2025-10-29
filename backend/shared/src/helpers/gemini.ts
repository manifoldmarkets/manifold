import { GoogleGenerativeAI } from '@google/generative-ai'
import { APIError } from 'common/api/utils'
import { log } from 'shared/utils'

export const models = {
  flash: 'gemini-2.5-flash-lite' as const,
  flashThinking: 'gemini-2.5-flash' as const,
  pro: 'gemini-2.5-pro' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptGeminiParsingJson = async <T>(
  prompt: string,
  options: { system?: string; model?: model_types; webSearch?: boolean } = {}
): Promise<T> => {
  const response = await promptGemini(prompt, options)
  return parseAIResponseAsJson(response)
}

export const promptGemini = async (
  prompt: string,
  options: { system?: string; model?: model_types; webSearch?: boolean } = {}
) => {
  const { model = models.flash, system, webSearch = false } = options

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new APIError(500, 'Missing GEMINI_API_KEY')
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  // Configure model with optional Google Search grounding
  const modelConfig: any = { model }
  if (webSearch) {
    modelConfig.tools = [{ googleSearch: {} }]
  }

  const geminiModel = genAI.getGenerativeModel(modelConfig)

  try {
    // Combine system prompt and user prompt if system is provided
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt

    const result = await geminiModel.generateContent(fullPrompt)
    const response = result.response.text()

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
