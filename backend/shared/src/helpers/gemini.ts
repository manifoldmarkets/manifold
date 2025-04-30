import { GoogleGenerativeAI } from '@google/generative-ai'
import { log } from 'shared/utils'
import { APIError } from 'common/api/utils'

export const models = {
  flash: 'gemini-2.0-flash' as const,
  pro: 'gemini-2.5-pro-preview-03-25' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptGemini = async (
  prompt: string,
  options: { system?: string; model?: model_types } = {}
) => {
  const { model = models.flash, system } = options

  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new APIError(500, 'Missing GEMINI_API_KEY')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({ model })

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
const removeJsonTicksFromGeminiResponse = (response: string): string => {
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
export const parseGeminiResponseAsJson = (response: string): any => {
  const cleanedResponse = removeJsonTicksFromGeminiResponse(response)

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
      } catch (e) {
        // If still fails, throw the original error
        throw error
      }
    }

    // If we can't fix it, throw the original error
    throw error
  }
}
