import { APIError } from 'common/api/utils'
import {
  guidelinesPrompt,
  perplexitySystemPrompt,
} from 'common/ai-creation-prompts'
export const smallPerplexityModel = 'llama-3.1-sonar-small-128k-online'
export const largePerplexityModel = 'llama-3.1-sonar-large-128k-online'
export const hugePerplexityModel = 'llama-3.1-sonar-huge-128k-online'

export const perplexity = async (
  query: string,
  options: {
    model?: string
    systemPrompts?: string[]
  } = {}
) => {
  const apiKey = process.env.PERPLEXITY_API_KEY
  const {
    model = smallPerplexityModel,
    systemPrompts = [perplexitySystemPrompt, guidelinesPrompt],
  } = options
  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        ...systemPrompts.map((prompt) => ({
          role: 'system',
          content: prompt,
        })),
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.2,
      return_citations: true,
    }),
  }

  try {
    const response = await fetch(
      'https://api.perplexity.ai/chat/completions',
      requestOptions
    )
    const data = await response.json()

    // Extract citations if they exist
    const citations = (data.citations || []) as string[]

    // Map the choices and attach only referenced citations
    const messages = data.choices.map(
      (choice: any) => choice.message.content
    ) as string[]

    return { messages, citations }
  } catch (err) {
    console.error(err)
    throw new APIError(500, 'Failed to generate markets')
  }
}
