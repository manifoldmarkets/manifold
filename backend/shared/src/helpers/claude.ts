// import { getSecrets } from 'common/secrets'
import Anthropic from '@anthropic-ai/sdk'
import { removeUndefinedProps } from 'common/util/object'

export const models = {
  sonnet: 'claude-3-7-sonnet-20250219' as const,
}

export type model_types = (typeof models)[keyof typeof models]

export const promptClaudeStream = async function* (
  prompt: string,
  options: { system?: string; model?: model_types } = {}
): AsyncGenerator<string, void, unknown> {
  const { model = models.sonnet, system } = options

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY')
  }

  const anthropic = new Anthropic({ apiKey })

  const stream = anthropic.messages.stream(
    removeUndefinedProps({
      model,
      max_tokens: 4096,
      temperature: 0,
      system,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })
  )

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text
    }
  }
}

export const promptClaude = async (
  prompt: string,
  options: { system?: string; model?: model_types } = {}
) => {
  let fullResponse = ''
  for await (const chunk of promptClaudeStream(prompt, options)) {
    fullResponse += chunk
  }
  return fullResponse
}

// Helper function to clean Claude responses from markdown formatting
const removeJsonTicksFromClaudeResponse = (response: string): string => {
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
export const parseClaudeResponseAsJson = (response: string): any => {
  const cleanedResponse = removeJsonTicksFromClaudeResponse(response)

  try {
    // Try to parse as is
    return JSON.parse(cleanedResponse)
  } catch (error) {
    // If parsing fails, try to handle common issues

    // Check if it's an array wrapped in extra text - using a more compatible regex approach
    // Instead of using the 's' flag which requires ES2018+
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
