import { APIError, APIHandler, AuthedUser } from './helpers/endpoint'
import { AIGeneratedMarket } from 'common/contract'
import { log } from 'shared/utils'
import { formattingPrompt, guidelinesPrompt } from 'common/ai-creation-prompts'
import { anythingToRichText } from 'shared/tiptap'
import { track } from 'shared/analytics'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'
import { promptOpenAIWebSearchParseJson } from 'shared/helpers/openai-utils'
import { APIParams } from 'common/api/schema'

export const generateSuggestions = async (
  props: APIParams<'generate-ai-market-suggestions'>,
  auth: AuthedUser
) => {
  const { prompt, existingTitles } = props
  log('Prompt:', prompt)

  const promptIncludingTitlesToIgnore = existingTitles?.length
    ? `${prompt}\n\nPlease suggest new market ideas that are different from these ones:\n${existingTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : prompt

  const combinedPrompt = `
    You are a helpful assistant that suggests ideas for engaging prediction markets on Manifold Markets based on a user's prompt.
    Your role is to take the user's prompt and transform it into 6 well-structured prediction markets that encourage participation and meaningful forecasting.
    Use your own knowledge and web search capabilities if necessary to gather relevant information.
    Today is ${new Date().toISOString()}
    ${guidelinesPrompt}

    Here is the user's prompt, potentially including URLs you should scrape:
    ${promptIncludingTitlesToIgnore}

    ${formattingPrompt}

    ONLY return a valid JSON array of market objects and do NOT include any other text.
  `

  const response = await promptOpenAIWebSearchParseJson<AIGeneratedMarket[]>(
    combinedPrompt
  )

  // Parse the JSON response
  let parsedMarkets: AIGeneratedMarket[] = []
  try {
    parsedMarkets = response.map((market: AIGeneratedMarket) => ({
      ...market,
      description:
        anythingToRichText({
          markdown: market.descriptionMarkdown,
        }) ?? '',
      promptVersion: 1,
    }))
  } catch (e) {
    log.error('Failed to parse openai response:', { e })
    throw new APIError(
      500,
      'Failed to parse market suggestions from openai. Please try again.'
    )
  }
  track(auth.uid, 'generate-ai-market-suggestions', {
    marketTitles: parsedMarkets.map((m) => m.question),
    prompt,
    regenerate: !!existingTitles,
  })

  return parsedMarkets
}

// In this version, we use Perplexity to generate market suggestions, and then refine them with Claude
export const generateAIMarketSuggestions: APIHandler<'generate-ai-market-suggestions'> =
  rateLimitByUser(generateSuggestions, { maxCalls: 60, windowMs: HOUR_MS })
