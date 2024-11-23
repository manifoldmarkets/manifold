import { APIError, APIHandler } from './helpers/endpoint'
import { log } from 'shared/utils'
import { track } from 'shared/analytics'
import { anythingToRichText } from 'shared/tiptap'
import { largePerplexityModel, perplexity } from 'shared/helpers/perplexity'
import { models, promptClaude } from 'shared/helpers/claude'

export const generateAIDescription: APIHandler<
  'generate-ai-description'
> = async (props, auth) => {
  const { question, description } = props

  const userQuestionAndDescription = `Question: ${question} ${
    description ? `\n\nCurrent description: ${description}` : ''
  }`

  log('Generating AI description for:', userQuestionAndDescription)
  try {
    const { messages, citations } = await perplexity(
      userQuestionAndDescription,
      {
        model: largePerplexityModel,
        systemPrompts: [
          `You are a helpful AI assistant that researches information about the user's prompt`,
        ],
      }
    )
    const perplexityResponse =
      [messages].join('\n') + '\n\nSources:\n' + citations.join('\n\n')

    const systemPrompt = `You are a helpful AI assistant that generates detailed descriptions for prediction markets. Your goal is to provide relevant context, background information, and clear resolution criteria that will help traders make informed predictions.
Guidelines:
- Keep descriptions concise but informative
- Include relevant sources and data when available
- Clearly state how the market will be resolved
- Try to think of any edge cases or special scenarios that traders should be aware of, mention them in the description and how the market will be resolved in those cases
- Don't repeat the question in the description
- Focus on objective facts rather than opinions
- Format the response as markdown with sections such as "Background", "Resolution criteria", "Things to consider", etc.
- Here is current information from the internet that is related to the user's prompt. Include information from it in the description that traders or other readers may want to know if it's relevant to the user's question:
${perplexityResponse}
`

    const prompt = `${userQuestionAndDescription}\n\n Only return the markdown description, nothing else`
    const claudeResponse = await promptClaude(prompt, {
      model: models.sonnet,
      system: systemPrompt,
    })

    track(auth.uid, 'generate-ai-description', {
      question,
      hasExistingDescription: !!description,
    })

    return { description: anythingToRichText({ markdown: claudeResponse }) }
  } catch (e) {
    console.error('Failed to generate description:', e)
    throw new APIError(500, 'Failed to generate description. Please try again.')
  }
}
